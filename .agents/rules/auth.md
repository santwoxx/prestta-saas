# Regras de Autenticação (Auth)

- **Criação de conta é exclusiva via Google**: todo cadastro de nova empresa (tenant + usuário dono)
  passa pelo Firebase Authentication com `GoogleAuthProvider`. O backend (`firebase-admin`) valida o
  ID token em `/api/signup/google` e `/api/login/google`, e identifica a conta pelo e-mail retornado.
- **Login tem dois caminhos**:
  1. **Google** — caminho principal, usado por donos e administradores.
  2. **E-mail + senha** (`/api/login`) — mantido para os **colaboradores de campo**, que são cadastrados
     pelo gestor em `/api/team` com uma senha definida por ele. Muita equipe em campo usa e-mail
     corporativo sem conta Google; sem esse caminho eles ficariam sem acesso ao app.
- **Senhas** usam `scrypt` nativo (`server/auth.js`), nunca texto puro. Contas criadas via Google
  recebem uma senha aleatória que nunca é usada.
- **Sessão**: cookie `servio_session` httpOnly, assinado em HS256 com `APP_SECRET`. Em produção o
  servidor recusa subir se `APP_SECRET` for fraco ou for o valor de exemplo.
- **Autorização**: o papel (`dono`, `admin`, `campo`, `superadmin`) e o `tenant_id` vêm do banco a cada
  requisição (`auth.attachUser`), nunca do token. Quando o mesmo e-mail existe em mais de uma conta, o
  login pelo Google entra sempre pela de maior privilégio.
