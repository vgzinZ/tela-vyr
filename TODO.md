# Tela VYR — entregas

## Landing page e identidade visual
- [x] A página inicial em português do Brasil é escura, elegante e responsiva, com destaque em roxo/lilás, tipografia sans-serif contemporânea, cartões com bordas suaves, gradientes roxo/azul e detalhes de status ao vivo.
- [x] A página comunica que a tela é compartilhada diretamente entre navegadores, sem instalação e sem cadastro, e que várias pessoas podem transmitir ao mesmo tempo.
- [x] A interface tem contraste adequado, foco visível, uso por teclado e adaptação para celular e desktop.

## Criação e entrada em salas
- [x] A pessoa consegue criar uma sala em um clique, sem cadastro, recebendo código e link de convite.
- [x] A pessoa consegue entrar por código ou link, escolhendo nickname e avatar antes do acesso.
- [x] O produto fornece feedback claro para código inválido, sala inexistente/encerrada e ações de copiar convite.

## Sala e compartilhamento
- [x] A sala exibe estado vazio e estado ativo, com lista dinâmica de participantes, nickname, avatar e estado de transmissão.
- [x] A pessoa consegue iniciar e parar o compartilhamento de tela pelo navegador com `getDisplayMedia`.
- [x] O fluxo trata cancelamento, permissão negada e encerramento pelo navegador com mensagens em português do Brasil.
- [x] A sala exibe transmissões ativas em uma grade adaptável, com identificação e status ao vivo.
- [x] A pessoa consegue copiar o convite e sair da sala com feedback visual.
- [x] A sinalização WebSocket e a negociação WebRTC entre participantes foram adicionadas ao servidor, com STUN público para descoberta de candidatos.
