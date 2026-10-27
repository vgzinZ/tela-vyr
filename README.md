# Tela VYR — compartilhamento de tela ao vivo

Site em React + Express. As pessoas entram numa sala (código ou link) e compartilham a tela
direto entre os navegadores (WebRTC). O servidor só faz a "sinalização" das salas via WebSocket
em `/api/signaling`. Não precisa de login nem de banco de dados.

## Rodar no seu computador

```bash
corepack enable
pnpm install
pnpm dev        # abre em http://localhost:3000
```

## Publicar de graça no Render

1. Suba esta pasta para um repositório no GitHub.
2. No Render: **New +** → **Web Service** → escolha o repositório.
3. O Render detecta o `Dockerfile`. Em **Instance Type**, escolha **Free**.
4. Clique em **Create Web Service** e espere o primeiro deploy terminar.

(Alternativa: **New +** → **Blueprint** usa o arquivo `render.yaml` desta pasta.)

## Observações

- O plano gratuito do Render "dorme" depois de ~15 min sem acessos; o primeiro acesso depois disso demora para acordar.
- As salas ficam na memória do servidor: se ele reiniciar ou dormir, as salas abertas somem.
- Verificação de saúde: `GET /api/health`.
- O compartilhamento de tela só funciona em HTTPS (o Render já entrega HTTPS).
- Só há servidor STUN. Em redes muito restritas pode ser preciso adicionar um servidor TURN.
