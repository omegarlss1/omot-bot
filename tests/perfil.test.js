const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validarDataNascimento,
  sanitizeTextoLivre,
  calcularIdade,
  hasPermissaoAdmin,
  normalizarOpcaoPermitida
} = require('../src/features/perfil/validation');

const { calcularCategorias, calcularNotaCategoria } = require('../src/data/mapa_indicadores');
const { gerarNomeCall } = require('../src/features/calls/naming');
const { formatarBarra } = require('../src/features/perfil/embeds');

test('validarDataNascimento', async (t) => {
  await t.test('deve aceitar datas válidas no formato DD/MM/AAAA', () => {
    const res = validarDataNascimento('15/08/2000');
    assert.equal(res.ok, true);
    assert.equal(res.value, '2000-08-15');
  });

  await t.test('deve aceitar ano bissexto válido', () => {
    const res = validarDataNascimento('29/02/2024');
    assert.equal(res.ok, true);
    assert.equal(res.value, '2024-02-29');
  });

  await t.test('deve rejeitar 29 de fevereiro em ano não bissexto', () => {
    const res = validarDataNascimento('29/02/2023');
    assert.equal(res.ok, false);
  });

  await t.test('deve rejeitar dias inexistentes (32/01/2000)', () => {
    const res = validarDataNascimento('32/01/2000');
    assert.equal(res.ok, false);
  });

  await t.test('deve rejeitar formatos incorretos (AAAA-MM-DD)', () => {
    const res = validarDataNascimento('2000-08-15');
    assert.equal(res.ok, false);
  });

  await t.test('deve aceitar valor vazio e retornar null', () => {
    const res = validarDataNascimento('');
    assert.equal(res.ok, true);
    assert.equal(res.value, null);
  });
});

test('calcularIdade', async (t) => {
  await t.test('deve calcular a idade corretamente para data no passado', () => {
    const hoje = new Date();
    const anoNasc = hoje.getFullYear() - 20;
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const idade = calcularIdade(`${anoNasc}-${mes}-${dia}`);
    assert.equal(idade, 20);
  });

  await t.test('deve retornar 0 para data nula ou inválida', () => {
    assert.equal(calcularIdade(null), 0);
    assert.equal(calcularIdade('invalida'), 0);
  });
});

test('sanitizeTextoLivre', async (t) => {
  await t.test('deve remover menções de @everyone e @here', () => {
    const texto = 'Olá @everyone e @here!';
    const sanitizado = sanitizeTextoLivre(texto);
    assert.equal(sanitizado.includes('@everyone'), false);
    assert.equal(sanitizado.includes('@here'), false);
  });

  await t.test('deve truncar no tamanho máximo configurado', () => {
    const texto = 'A'.repeat(200);
    const sanitizado = sanitizeTextoLivre(texto, { maxLength: 50 });
    assert.equal(sanitizado.length, 50);
  });
});

test('normalizarOpcaoPermitida', async (t) => {
  await t.test('deve encontrar correspondência case-insensitive', () => {
    const opcoes = ['Touch', 'Controle', 'Híbrido'];
    assert.equal(normalizarOpcaoPermitida('touch', opcoes), 'Touch');
    assert.equal(normalizarOpcaoPermitida('CONTROLE', opcoes), 'Controle');
  });

  await t.test('deve retornar null se não existir', () => {
    const opcoes = ['Touch', 'Controle'];
    assert.equal(normalizarOpcaoPermitida('Teclado', opcoes), null);
  });
});

test('hasPermissaoAdmin', async (t) => {
  await t.test('deve retornar true para membro com permissão Administrator', () => {
    const mockMember = {
      permissions: { has: (perm) => perm === 8n }
    };
    assert.equal(hasPermissaoAdmin(mockMember), true);
  });

  await t.test('deve retornar true para cargo contendo "moderação"', () => {
    const mockMember = {
      permissions: { has: () => false },
      roles: { cache: [{ name: 'Moderação Ômega' }] }
    };
    assert.equal(hasPermissaoAdmin(mockMember), true);
  });

  await t.test('deve retornar false para membro sem permissão', () => {
    const mockMember = {
      permissions: { has: () => false },
      roles: { cache: [{ name: 'Membro' }, { name: 'Player' }] }
    };
    assert.equal(hasPermissaoAdmin(mockMember), false);
  });
});

test('gerarNomeCall', async (t) => {
  await t.test('deve formatar nome de call individual', () => {
    const nome = gerarNomeCall('sideswipe', 'Flavio', null, 1);
    assert.equal(nome, '🎮 | RL SideSwipe | Flavio');
  });

  await t.test('deve formatar sufixo de 1 amigo (+1 Ômigo)', () => {
    const nome = gerarNomeCall('sideswipe', 'Flavio', null, 2);
    assert.equal(nome, '🎮 | RL SideSwipe | Flavio +1 Ômigo');
  });

  await t.test('deve formatar sufixo de múltiplos amigos (+2 Ômigos)', () => {
    const nome = gerarNomeCall('diversos', 'Flavio', 'Valorant', 3);
    assert.equal(nome, '🎮 | Valorant | Flavio +2 Ômigos');
  });
});

test('formatarBarra', async (t) => {
  await t.test('deve gerar barra com preenchimento correto', () => {
    assert.equal(formatarBarra(0), '░░░░░░░░░░');
    assert.equal(formatarBarra(50), '█████░░░░░');
    assert.equal(formatarBarra(100), '██████████');
  });
});

test('calcularNotaCategoria', async (t) => {
  await t.test('deve calcular porcentagem arredondada', () => {
    assert.equal(calcularNotaCategoria(5, 10), 50);
    assert.equal(calcularNotaCategoria(1, 3), 33);
    assert.equal(calcularNotaCategoria(0, 10), 0);
  });
});

test('titulosCustomizados', async (t) => {
  const { extrairIconeTitulo, getTitulosDoJogador } = require('../src/data/titulos');

  await t.test('deve detectar ícone apropriado para 1º lugar, campeão, vice e mvp', () => {
    assert.equal(extrairIconeTitulo('1º Lugar'), '🥇');
    assert.equal(extrairIconeTitulo('Campeão do Torneio'), '🏆');
    assert.equal(extrairIconeTitulo('Vice-Campeão'), '🥈');
    assert.equal(extrairIconeTitulo('3º Lugar'), '🥉');
    assert.equal(extrairIconeTitulo('MVP da Final'), '🏅');
    assert.equal(extrairIconeTitulo('Participante Destaque'), '🏆');
  });

  await t.test('deve formatar títulos customizados como objetos válidos', () => {
    const titulos = getTitulosDoJogador(['🥇 Campeão - Torneio Interno (S4)', 'campeao_omega_s3']);
    assert.equal(titulos.length, 2);
    assert.equal(titulos[0].nome, '🥇 Campeão - Torneio Interno (S4)');
    assert.equal(titulos[0].icone, '🥇');
    assert.equal(titulos[1].id, 'campeao_omega_s3');
  });
});

test('calcularQuadroMedalhas', async (t) => {
  const { calcularQuadroMedalhas } = require('../src/features/perfil/embeds');

  await t.test('deve contar medalhas separadas por tipo (omega e comunidade)', () => {
    const titulos = [
      { tipo: 'omega', colocacao: 1 },
      { tipo: 'omega', colocacao: 1 },
      { tipo: 'omega', colocacao: 2 },
      { tipo: 'omega', colocacao: 3 },
      { tipo: 'comunidade', colocacao: 1 },
      { tipo: 'comunidade', colocacao: 3 }
    ];
    const quadro = calcularQuadroMedalhas(titulos);
    assert.equal(quadro.omega.ouro, 2);
    assert.equal(quadro.omega.prata, 1);
    assert.equal(quadro.omega.bronze, 1);
    assert.equal(quadro.comunidade.ouro, 1);
    assert.equal(quadro.comunidade.prata, 0);
    assert.equal(quadro.comunidade.bronze, 1);
  });

  await t.test('deve retornar zerado quando não há títulos', () => {
    const quadro = calcularQuadroMedalhas([]);
    assert.equal(quadro.omega.ouro, 0);
    assert.equal(quadro.comunidade.ouro, 0);
  });

  await t.test('deve ignorar colocações inválidas', () => {
    const quadro = calcularQuadroMedalhas([{ tipo: 'omega', colocacao: 5 }, { tipo: 'omega', colocacao: null }]);
    assert.equal(quadro.omega.ouro + quadro.omega.prata + quadro.omega.bronze, 0);
  });
});

test('escapeRegex para busca de nick duplicado', async (t) => {
  function escapeRegex(texto) {
    return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  await t.test('deve escapar caracteres especiais de regex', () => {
    assert.equal(escapeRegex('Omotzin.ss'), 'Omotzin\\.ss');
    assert.equal(escapeRegex('a+b*c'), 'a\\+b\\*c');
    assert.equal(escapeRegex('(teste)'), '\\(teste\\)');
  });
});
