package httpx

import (
	"fmt"
	"net/http"
	"strings"
)

// Error messages are written in English at the call site (the format string is the key).
// When the client asks for Portuguese (Accept-Language: pt…), Fail looks the format up in
// catalogPT and renders it with the same arguments. Unknown formats fall back to English,
// so a missing translation never hides an error.

// WantsPT reports whether the request prefers Portuguese.
func WantsPT(r *http.Request) bool {
	for _, part := range strings.Split(r.Header.Get("Accept-Language"), ",") {
		tag := strings.ToLower(strings.TrimSpace(strings.SplitN(part, ";", 2)[0]))
		switch {
		case tag == "pt" || strings.HasPrefix(tag, "pt-"):
			return true
		case tag == "en" || strings.HasPrefix(tag, "en-"):
			return false
		}
	}
	return false
}

// Localize renders format+args in the request's language, or returns fallback.
func Localize(r *http.Request, format string, args []any, fallback string) string {
	if r == nil || !WantsPT(r) || format == "" {
		return fallback
	}
	if f, ok := catalogPT[format]; ok {
		return fmt.Sprintf(f, args...)
	}
	return fallback
}

var catalogPT = map[string]string{
	"the terminal is disabled on this server":                  "o terminal está desativado neste servidor",
	"too many terminal sessions":                               "sessões de terminal demais",
	"terminal session not found":                               "sessão de terminal não encontrada",
	"already configured":                                       "já configurado",
	"already exists":                                           "já existe",
	"analysis not found":                                       "análise não encontrada",
	"app not found":                                            "app não encontrado",
	"cannot access %s":                                         "não foi possível acessar %s",
	"cannot access that path":                                  "não foi possível acessar esse caminho",
	"cannot delete a root":                                     "não é possível excluir uma pasta raiz",
	"cannot move or copy a root":                               "não é possível mover ou copiar uma pasta raiz",
	"cannot place a folder inside itself":                      "não é possível colocar uma pasta dentro dela mesma",
	"cannot rename a root":                                     "não é possível renomear uma pasta raiz",
	"category is too long":                                     "a categoria é longa demais",
	"container not found":                                      "container não encontrado",
	"cross-origin request blocked":                             "requisição de outra origem bloqueada",
	"current password is incorrect":                            "a senha atual está incorreta",
	"destination is not a directory":                           "o destino não é uma pasta",
	"directory is not empty":                                   "a pasta não está vazia",
	"directory tree is too deep":                               "a árvore de pastas é profunda demais",
	"docker apps need at least one container":                  "apps Docker precisam de ao menos um container",
	"docker: %s":                                               "docker: %s",
	"duplicate widget instance %q":                             "instância de widget duplicada %q",
	"icon must be empty, lucide:<name> or an http(s) URL":      "o ícone deve ser vazio, lucide:<nome> ou uma URL http(s)",
	"internal error":                                           "erro interno",
	"invalid JSON body: %v":                                    "corpo JSON inválido: %v",
	"invalid container id":                                     "id de container inválido",
	"invalid container name %q":                                "nome de container inválido %q",
	"invalid name %q":                                          "nome inválido %q",
	"invalid path":                                             "caminho inválido",
	"invalid position":                                         "posição inválida",
	"invalid setting %q":                                       "configuração inválida %q",
	"invalid setup code (see the server log)":                  "código de configuração inválido (veja o log do servidor)",
	"invalid systemd unit %q":                                  "unit do systemd inválida %q",
	"invalid trash id":                                         "id da lixeira inválido",
	"invalid widget id":                                        "id de widget inválido",
	"name is required (max 40 characters)":                     "o nome é obrigatório (máx. 40 caracteres)",
	"name is required (max 60 characters)":                     "o nome é obrigatório (máx. 60 caracteres)",
	"not a directory":                                          "não é uma pasta",
	"not a regular file":                                       "não é um arquivo comum",
	"not found":                                                "não encontrado",
	"nothing selected":                                         "nada selecionado",
	"only mount points and authorised folders can be analysed": "só é possível analisar pontos de montagem e pastas autorizadas",
	"password must have at least %d characters":                "a senha deve ter pelo menos %d caracteres",
	"path escapes the authorised root":                         "o caminho sai da pasta autorizada",
	"path is required":                                         "o caminho é obrigatório",
	"path must be absolute":                                    "o caminho deve ser absoluto",
	"permission denied":                                        "permissão negada",
	"%q already exists":                                        "%q já existe",
	"root %q is not available: %v":                             "a pasta %q não está disponível: %v",
	"root %q is read-only":                                     "a pasta %q é somente leitura",
	"%s is not a directory":                                    "%s não é uma pasta",
	"systemd apps need at least one unit":                      "apps systemd precisam de ao menos uma unit",
	"systemd: %v":                                              "systemd: %v",
	"systemd job %s for %s":                                    "job do systemd %s para %s",
	"systemd job timed out":                                    "tempo esgotado no job do systemd",
	"that directory is already authorised":                     "essa pasta já está autorizada",
	"that directory is part of NodeDesk's own data and cannot be exposed": "essa pasta faz parte dos dados do próprio NodeDesk e não pode ser exposta",
	"that location is protected":                                          "esse local é protegido",
	"that location is reserved":                                           "esse local é reservado",
	"the file changed on disk since you opened it":                        "o arquivo mudou no disco desde que você o abriu",
	"the name did not change":                                             "o nome não mudou",
	"this app has nothing to %s":                                          "este app não tem nada para %s",
	"too many analyses running, try again shortly":                        "análises demais em andamento, tente novamente em instantes",
	"too many containers or units":                                        "containers ou units demais",
	"too many widgets":                                                    "widgets demais",
	"type must be one of %s":                                              "o tipo deve ser um de %s",
	"unknown action":                                                      "ação desconhecida",
	"unknown disk":                                                        "disco desconhecido",
	"unknown root":                                                        "pasta raiz desconhecida",
	"unknown root %q":                                                     "pasta raiz desconhecida %q",
	"url apps need a url":                                                 "apps de URL precisam de uma URL",
	"url must be a valid http(s) address":                                 "a URL deve ser um endereço http(s) válido",
	"widget %q has invalid geometry":                                      "o widget %q tem geometria inválida",
	"widget %q has invalid settings":                                      "o widget %q tem configurações inválidas",
	"file is larger than %d MB":                                           "o arquivo é maior que %d MB",
	"file is not UTF-8 text":                                              "o arquivo não é texto UTF-8",
	"content is larger than %d MB":                                        "o conteúdo é maior que %d MB",
	"no space left on device":                                             "sem espaço restante no dispositivo",
	"wrong password":                                                      "senha incorreta",
	"too many attempts, wait a minute":                                    "tentativas demais, aguarde um minuto",
	"sign in required":                                                    "é necessário entrar",
	"%s":                                                                  "%s",
}
