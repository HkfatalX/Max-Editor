# Max Editor

Editor de vídeo leve e rápido para **celular e PC** — site (PWA) e app Android (APK).

- **Site:** `index.html` (GitHub Pages) · **APK:** gerado pelo GitHub Actions
- Timeline com trilhas (vídeo, sobrepor, texto, áudio), dividir/aparar/duplicar, desfazer/refazer
- Proporções: 9:16, 16:9, 1:1, 4:5, 3:4, 4:3, 21:9
- Filtros, ajustes de cor, velocidade, volume, animações, transições, texto, gravação de voz
- **Autosave** (IndexedDB + espelho anti-crash) e reabertura do último projeto
- Prévia adaptativa que reduz qualidade sozinha em aparelhos fracos
- Exportação 480p/720p/1080p (MP4 quando o aparelho suporta, senão WebM)
- Aviso de **versão nova** (compara `version.json` do site com o instalado)

## Publicar o site
Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
O endereço fica `https://hkfatalx.github.io/Max-Editor/`.

## Gerar o APK
Push na `main` (ou Actions → *Build APK* → Run workflow). O APK assinado aparece em
**Releases → MaxEditor.apk** e o link `releases/latest/download/MaxEditor.apk` sempre aponta para o mais novo.

## Lançar uma versão nova
1. Aumente `version` em `version.json` e escreva as `notes`.
2. Faça commit/push. Quem tem o app/site aberto recebe o aviso "Nova versão disponível".

> A chave em `android-signing/` mantém a assinatura estável para o APK atualizar por cima do antigo.
> Como o repositório é público, se quiser mais segurança troque por um *secret* do GitHub.
