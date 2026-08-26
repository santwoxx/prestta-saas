# Regras de Autenticação (Auth)

- **Login e Cadastro Exclusivos via Google**: Todo o fluxo de autenticação e criação de conta do Prestta deve ser feito estritamente utilizando a integração do Firebase Authentication com a provedora do Google (`GoogleAuthProvider`). 
- **Sem senhas locais**: O sistema não deve oferecer ou processar formulários manuais de e-mail e senha. As contas são identificadas de forma única através da conta Google do usuário.
- **Autorização do Backend**: O backend (`firebase-admin`) valida o token JWT enviado pelo frontend via `/api/login/google` e gerencia as permissões de acesso ao workspace (`tenant_id`) com base no e-mail retornado.
