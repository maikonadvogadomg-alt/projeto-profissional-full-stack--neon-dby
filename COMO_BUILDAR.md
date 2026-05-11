# Como gerar o APK com EAS

## Passo 1 â Colocar a URL do seu app

Abra o arquivo `App.tsx` e troque a linha:

```
const APP_URL = 'https://SEU-APP.replit.app';
```

Pela URL real do seu app publicado no Replit (ex: `https://assistente-juridico-maikon.replit.app`).

---

## Passo 2 â Instalar dependÃªncias

Na pasta `expo-app`, rode:

```bash
npm install
```

---

## Passo 3 â Login no EAS

```bash
npx eas login
```

---

## Passo 4 â Configurar o projeto (sÃ³ na primeira vez)

```bash
npx eas build:configure
```

Quando perguntar o slug, coloque: `assistente-juridico`

---

## Passo 5 â Gerar o APK

Para gerar APK direto (sem Google Play):

```bash
npx eas build --platform android --profile preview
```

- Vai fazer upload do cÃ³digo para o servidor da Expo
- Leva ~5-10 minutos
- No final aparece um link para baixar o APK
- Instala direto no celular!

---

## Passo 6 â Instalar no celular

1. Baixe o APK pelo link
2. No celular Android: ConfiguraÃ§Ãµes â SeguranÃ§a â Fontes desconhecidas â Ativar
3. Abra o APK baixado e instale

---

## ObservaÃ§Ã£o importante

O app abre o seu site dentro do celular como app nativo.
Precisa de internet para funcionar (igual WhatsApp Web, Gmail, etc.).
Todas as suas chaves de IA ficam salvas no servidor â nÃ£o precisa configurar de novo.
