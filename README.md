# Album Odyssey

Jogo pessoal de descoberta musical com uma Season 1 de 500 álbuns.

## O que já existe

- 500 álbuns curados em rock/metal/post-hardcore/alternative e adjacências.
- Modos: Me surpreenda, peso, sentir, guitarra, atmosfera, clássico, scene/2000s, fora da bolha.
- Modo **Recomende para meu fone**.
- Um **melhor fone da coleção** atribuído a cada álbum.
- Capas via endpoint serverless usando Apple/iTunes Search API.
- Histórico de audições, notas, faixa favorita, comentário e fone utilizado.
- Biblioteca com capas reveladas conforme os discos são concluídos.
- Ranking e estatísticas.
- PWA instalável.
- Funciona em modo local sem backend.
- Pronto para sincronizar entre dispositivos usando Supabase.

## Estrutura

- `index.html` — interface.
- `styles.css` — visual mobile-first.
- `app.js` — regras do jogo.
- `data/catalog.js` — catálogo embarcado.
- `data/albums.json` — catálogo em JSON.
- `data/headphones.json` — fones.
- `api/cover.js` — endpoint Vercel para capas.
- `supabase-schema.sql` — tabela + RLS.
- `config.js` — credenciais públicas do Supabase.
- `manifest.webmanifest` + `sw.js` — PWA.

## Publicação (quando formos colocar online)

1. Criar um projeto Supabase.
2. Rodar `supabase-schema.sql` no SQL Editor.
3. Copiar `Project URL` e `anon public key` para `config.js`.
4. Subir esta pasta para um repositório GitHub.
5. Importar o repositório na Vercel.
6. No Supabase Auth, incluir a URL final da Vercel nas URLs permitidas de redirecionamento.
7. Abrir o site, entrar por magic link e pronto.

## Observação sobre as capas

As capas são buscadas sob demanda pelo endpoint `/api/cover`, que consulta a API de busca da Apple e guarda a URL no cache do navegador. A biblioteca faz lazy-load para não tentar resolver 500 capas de uma vez.

## Sobre os fones

A recomendação de fone é curada por perfil musical/produção do álbum e pela função pretendida de cada fone na coleção. É uma heurística de experiência, não uma medição eletroacústica. Podemos recalibrar depois com as preferências reais do usuário.
