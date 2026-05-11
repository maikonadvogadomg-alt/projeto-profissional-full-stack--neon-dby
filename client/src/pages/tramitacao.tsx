import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Settings, Users, Bell, Search, Plus, RefreshCw,
  Loader2, ExternalLink, FileText, Phone, Mail, MapPin, Calendar,
  Eye, EyeOff, CheckCircle2, Circle, ChevronLeft, ChevronRight,
  Key, Copy, AlertCircle, Building2, Scale, BookOpen, Trash2,
  User2, Gavel, Bot,
} from "lucide-react";

function fmt(d: string) {
  if (!d) return "-";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function fmtPhone(p: string) {
  if (!p) return "";
  const n = p.replace(/\D/g, "");
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return p;
}

type Tab = "publicacoes" | "clientes" | "configuracoes";

export default function TramitacaoPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("publicacoes");
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [clientePage, setClientePage] = useState(1);
  const [clienteSearch, setClienteSearch] = useState("");
  const [selectedCliente, setSelectedCliente] = useState<any>(null);
  const [newNota, setNewNota] = useState("");
  const [webhookCopied, setWebhookCopied] = useState(false);

  const webhookUrl = `${window.location.origin}/api/webhooks/tramitacao`;

  // ââ Settings âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const { data: settingData, isLoading: settingLoading } = useQuery<{ value: string | null }>({
    queryKey: ["/api/settings/tramitacao_token"],
  });
  const savedToken = settingData?.value || "";

  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const saveTokenMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/settings/tramitacao_token", { value: tokenInput }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/tramitacao_token"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tramitacao/clientes"] });
      setTestResult(null);
      toast({ title: "Token salvo com sucesso!" });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const handleTestConnection = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/tramitacao/test");
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, message: "Erro de conexÃ£o com o servidor." });
    } finally {
      setTestLoading(false);
    }
  };

  // ââ Clientes âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const { data: clientesData, isLoading: clientesLoading, refetch: refetchClientes } = useQuery<any>({
    queryKey: ["/api/tramitacao/clientes", clientePage],
    queryFn: async () => {
      const res = await fetch(`/api/tramitacao/clientes?page=${clientePage}&per_page=20`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Erro ao buscar clientes" }));
        throw new Error(err.message || "Erro ao buscar clientes");
      }
      return res.json();
    },
    enabled: !!savedToken && tab === "clientes",
    retry: false,
  });

  const { data: clienteDetalhe, isLoading: clienteDetalheLoading } = useQuery<any>({
    queryKey: ["/api/tramitacao/clientes", selectedCliente?.id],
    queryFn: async () => {
      const res = await fetch(`/api/tramitacao/clientes/${selectedCliente.id}`);
      if (!res.ok) throw new Error("Erro ao buscar cliente");
      return res.json();
    },
    enabled: !!selectedCliente?.id,
  });

  // ââ Notas âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const { data: notasData, isLoading: notasLoading, refetch: refetchNotas } = useQuery<any>({
    queryKey: ["/api/tramitacao/notas", selectedCliente?.id],
    queryFn: async () => {
      const url = selectedCliente?.id
        ? `/api/tramitacao/notas?customer_id=${selectedCliente.id}&per_page=50`
        : `/api/tramitacao/notas?per_page=50`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erro ao buscar notas");
      return res.json();
    },
    enabled: !!selectedCliente?.id && !!savedToken,
  });

  const { data: usersData } = useQuery<any>({
    queryKey: ["/api/tramitacao/usuarios"],
    queryFn: async () => {
      const res = await fetch("/api/tramitacao/usuarios");
      if (!res.ok) return { users: [] };
      return res.json();
    },
    enabled: !!savedToken,
    staleTime: 300000,
  });
  const firstUserId = usersData?.users?.[0]?.id || "";

  const createNotaMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/tramitacao/notas", {
      note: {
        content: newNota,
        user_id: firstUserId,
        customer_id: selectedCliente?.id,
      },
    }),
    onSuccess: () => {
      setNewNota("");
      refetchNotas();
      toast({ title: "Nota criada!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteNotaMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tramitacao/notas/${id}`),
    onSuccess: () => { refetchNotas(); toast({ title: "Nota removida" }); },
  });

  // ââ PublicaÃ§Ãµes âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const { data: pubsData, isLoading: pubsLoading, refetch: refetchPubs } = useQuery<any>({
    queryKey: ["/api/tramitacao/publicacoes"],
    enabled: tab === "publicacoes",
  });
  const publicacoes: any[] = pubsData?.publicacoes || [];
  const naoLidas = publicacoes.filter(p => p.lida !== "sim").length;

  const syncPubsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/tramitacao/sync-publicacoes", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tramitacao/publicacoes"] });
      const total = data?.publicacoes?.length ?? 0;
      if (total > 0) {
        toast({ title: `${total} publicaÃ§Ã£o(Ãµes) encontrada(s)`, description: "PublicaÃ§Ãµes carregadas com sucesso." });
      } else {
        toast({ title: "Nenhuma publicaÃ§Ã£o ainda", description: "Configure o webhook no TramitaÃ§Ã£o Inteligente (veja as instruÃ§Ãµes na tela)." });
      }
    },
    onError: (e: any) => toast({ title: "Erro ao buscar publicaÃ§Ãµes", description: e.message, variant: "destructive" }),
  });

  const marcarLidaMutation = useMutation({
    mutationFn: ({ id, lida }: { id: string; lida: string }) =>
      apiRequest("PATCH", `/api/tramitacao/publicacoes/${id}/lida`, { lida }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tramitacao/publicacoes"] }),
  });

  const copyWebhook = useCallback(() => {
    navigator.clipboard.writeText(webhookUrl);
    setWebhookCopied(true);
    setTimeout(() => setWebhookCopied(false), 2000);
  }, [webhookUrl]);

  const clientes: any[] = clientesData?.customers || [];
  const pagination = clientesData?.pagination;
  const filteredClientes = clienteSearch
    ? clientes.filter(c =>
        c.name?.toLowerCase().includes(clienteSearch.toLowerCase()) ||
        c.cpf_cnpj?.includes(clienteSearch) ||
        c.email?.toLowerCase().includes(clienteSearch.toLowerCase()))
    : clientes;

  const cliente = clienteDetalhe?.customer || selectedCliente;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 flex-shrink-0">
        <Link href="/">
          <Button size="icon" variant="ghost" className="w-8 h-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <Scale className="w-5 h-5 text-primary" />
        <span className="font-semibold text-sm">TramitaÃ§Ã£o Inteligente</span>
        {naoLidas > 0 && (
          <Badge variant="destructive" className="text-xs px-1.5 py-0.5">{naoLidas} nova{naoLidas > 1 ? "s" : ""}</Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Link href="/robo-djen">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" data-testid="link-robo-djen">
              <Bot className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">RobÃ´ DJEN</span>
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b bg-muted/10 flex-shrink-0">
        {([
          { id: "publicacoes", label: "PublicaÃ§Ãµes DJE", icon: Bell },
          { id: "clientes", label: "Clientes", icon: Users },
          { id: "configuracoes", label: "ConfiguraÃ§Ãµes", icon: Settings },
        ] as { id: Tab; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setSelectedCliente(null); }}
            data-testid={`tab-${id}`}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {id === "publicacoes" && naoLidas > 0 && (
              <span className="ml-1 bg-destructive text-destructive-foreground text-[10px] rounded-full px-1.5 py-0.5">{naoLidas}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">

        {/* ââ TAB: PublicaÃ§Ãµes âââââââââââââââââââââââââââââââââââââââââââââââ */}
        {tab === "publicacoes" && (
          <div className="p-4 max-w-4xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">PublicaÃ§Ãµes do DiÃ¡rio de JustiÃ§a</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  PublicaÃ§Ãµes recebidas automaticamente via webhook do TramitaÃ§Ã£o Inteligente.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => syncPubsMutation.mutate()}
                disabled={syncPubsMutation.isPending || pubsLoading}
                data-testid="button-refresh-pubs"
              >
                {syncPubsMutation.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Buscando...</>
                  : <><RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar</>
                }
              </Button>
            </div>

            {!savedToken && (
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                <CardContent className="flex items-start gap-3 p-4">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Token nÃ£o configurado</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                      Configure seu token na aba ConfiguraÃ§Ãµes para ativar a integraÃ§Ã£o.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {savedToken && publicacoes.length === 0 && (
              <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                        PublicaÃ§Ãµes chegam sÃ³ pelo Webhook â precisa configurar 1 vez
                      </p>
                      <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                        O e-mail que vocÃª recebe vem direto do TramitaÃ§Ã£o Inteligente para vocÃª.
                        Para as publicaÃ§Ãµes aparecerem aqui no app tambÃ©m, vocÃª precisa configurar o Webhook deles uma Ãºnica vez. Depois disso Ã© automÃ¡tico.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-orange-900 dark:text-orange-100">
                    <p className="font-medium text-xs uppercase tracking-wide text-orange-600">Como configurar (5 passos):</p>
                    <ol className="space-y-1.5 text-xs pl-1">
                      <li className="flex gap-2"><span className="font-bold text-orange-600 shrink-0">1.</span> Acesse <a href="https://planilha.tramitacaointeligente.com.br" target="_blank" rel="noopener noreferrer" className="underline font-medium">planilha.tramitacaointeligente.com.br</a></li>
                      <li className="flex gap-2"><span className="font-bold text-orange-600 shrink-0">2.</span> No menu, vÃ¡ em <strong>API</strong> â <strong>Webhooks</strong></li>
                      <li className="flex gap-2"><span className="font-bold text-orange-600 shrink-0">3.</span> Clique em <strong>Adicionar Webhook</strong> (ou "New Webhook")</li>
                      <li className="flex gap-2"><span className="font-bold text-orange-600 shrink-0">4.</span> Cole a URL abaixo e selecione o evento <strong>publications.created</strong></li>
                      <li className="flex gap-2"><span className="font-bold text-orange-600 shrink-0">5.</span> Salve. Pronto! PrÃ³xima publicaÃ§Ã£o jÃ¡ aparece aqui automaticamente.</li>
                    </ol>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-orange-700 dark:text-orange-300 mb-1">URL do Webhook â copie e cole no TramitaÃ§Ã£o Inteligente:</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-white dark:bg-black/30 px-2 py-1.5 rounded border border-orange-300 flex-1 overflow-x-auto text-orange-800 dark:text-orange-200 select-all">
                        {webhookUrl}
                      </code>
                      <Button size="sm" variant="outline" onClick={copyWebhook} className="shrink-0 border-orange-300" data-testid="button-copy-webhook">
                        {webhookCopied ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-600 mr-1" /> Copiado!</> : <><Copy className="w-3.5 h-3.5 mr-1" /> Copiar URL</>}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {savedToken && publicacoes.length > 0 && (
              <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
                <CardContent className="p-3">
                  <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">URL do Webhook</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-white dark:bg-black/30 px-2 py-1 rounded border flex-1 overflow-x-auto text-blue-700 dark:text-blue-300">
                      {webhookUrl}
                    </code>
                    <Button size="sm" variant="outline" onClick={copyWebhook} data-testid="button-copy-webhook">
                      {webhookCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {pubsLoading && (
              <div className="flex items-center gap-2 p-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm text-muted-foreground">Carregando publicaÃ§Ãµes...</span>
              </div>
            )}

            {publicacoes.map((pub) => (
              <Card
                key={pub.id}
                className={`transition-all ${pub.lida === "sim" ? "opacity-60" : "border-primary/30 shadow-sm"}`}
                data-testid={`card-pub-${pub.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{pub.tribunal || "â"}</Badge>
                      {pub.inicioPrazoDate && (
                        <Badge variant={pub.lida !== "sim" ? "destructive" : "secondary"} className="text-xs">
                          Prazo: {fmt(pub.inicioPrazoDate)}
                        </Badge>
                      )}
                      {pub.lida !== "sim" && (
                        <Badge className="text-xs bg-blue-500">Nova</Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 shrink-0"
                      onClick={() => marcarLidaMutation.mutate({ id: pub.id, lida: pub.lida === "sim" ? "nao" : "sim" })}
                      data-testid={`button-lida-${pub.id}`}
                    >
                      {pub.lida === "sim" ? <Circle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                    </Button>
                  </div>

                  {pub.numeroProcessoMascara && (
                    <p className="text-sm font-mono font-semibold mb-1">{pub.numeroProcessoMascara}</p>
                  )}
                  {pub.orgao && <p className="text-xs text-muted-foreground mb-1">{pub.orgao}</p>}
                  {pub.classe && <p className="text-xs text-muted-foreground mb-2">{pub.classe}</p>}

                  {pub.texto && (
                    <details className="mt-2">
                      <summary className="text-xs text-primary cursor-pointer select-none hover:underline">
                        Ver texto completo
                      </summary>
                      <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap leading-relaxed border-t pt-2 max-h-60 overflow-auto">
                        {pub.texto}
                      </p>
                    </details>
                  )}

                  <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
                    <span>Disponib.: {fmt(pub.disponibilizacaoDate)}</span>
                    <span>PublicaÃ§Ã£o: {fmt(pub.publicacaoDate)}</span>
                    {pub.linkTramitacao && (
                      <a href={pub.linkTramitacao} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-primary hover:underline ml-auto">
                        <ExternalLink className="w-3 h-3" /> Ver no TramitaÃ§Ã£o
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ââ TAB: Clientes ââââââââââââââââââââââââââââââââââââââââââââââââââ */}
        {tab === "clientes" && !selectedCliente && (
          <div className="p-4 max-w-3xl mx-auto space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Clientes</h2>
              <Button size="sm" variant="outline" onClick={() => refetchClientes()} data-testid="button-refresh-clientes">
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
              </Button>
            </div>

            {!savedToken && (
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30">
                <CardContent className="flex items-center gap-2 p-4">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">Configure seu token na aba ConfiguraÃ§Ãµes primeiro.</p>
                </CardContent>
              </Card>
            )}

            {savedToken && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, CPF/CNPJ ou e-mail..."
                  className="pl-8"
                  value={clienteSearch}
                  onChange={(e) => setClienteSearch(e.target.value)}
                  data-testid="input-search-clientes"
                />
              </div>
            )}

            {clientesLoading && (
              <div className="flex items-center gap-2 p-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm text-muted-foreground">Carregando clientes...</span>
              </div>
            )}

            {!clientesLoading && savedToken && filteredClientes.length === 0 && (
              <div className="text-center py-10">
                <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
              </div>
            )}

            <div className="space-y-2">
              {filteredClientes.map((c) => (
                <Card
                  key={c.id}
                  className="cursor-pointer hover:shadow-md transition-all hover:border-primary/40"
                  onClick={() => setSelectedCliente(c)}
                  data-testid={`card-cliente-${c.id}`}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.cpf_cnpj}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="text-[10px]">{c.customer_type || "PF"}</Badge>
                      {c.tags?.length > 0 && (
                        <div className="flex gap-0.5">
                          {c.tags.slice(0, 2).map((t: any) => (
                            <span key={t.name} className="text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ background: t.color || "#6366f1" }}>
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button size="sm" variant="outline" disabled={clientePage <= 1} onClick={() => setClientePage(p => p - 1)} data-testid="button-prev-page">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  PÃ¡gina {pagination.page} de {pagination.pages} ({pagination.count} clientes)
                </span>
                <Button size="sm" variant="outline" disabled={clientePage >= pagination.pages} onClick={() => setClientePage(p => p + 1)} data-testid="button-next-page">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ââ Detalhe do Cliente ââââââââââââââââââââââââââââââââââââââââââââââ */}
        {tab === "clientes" && selectedCliente && (
          <div className="p-4 max-w-3xl mx-auto space-y-4">
            <Button size="sm" variant="ghost" onClick={() => setSelectedCliente(null)} data-testid="button-back-clientes">
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>

            {clienteDetalheLoading && (
              <div className="flex items-center gap-2 p-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Carregando...</span>
              </div>
            )}

            {cliente && (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User2 className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base">{cliente.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{cliente.cpf_cnpj}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">{cliente.customer_type || "PF"}</Badge>
                          {cliente.tags?.map((t: any) => (
                            <span key={t.name} className="text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ background: t.color || "#6366f1" }}>
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {cliente.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <a href={`mailto:${cliente.email}`} className="text-primary hover:underline truncate">{cliente.email}</a>
                      </div>
                    )}
                    {cliente.phone_mobile && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>{fmtPhone(cliente.phone_mobile)}</span>
                      </div>
                    )}
                    {cliente.phone_1 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>{fmtPhone(cliente.phone_1)}</span>
                      </div>
                    )}
                    {(cliente.city || cliente.state) && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>{[cliente.street, cliente.street_number, cliente.neighborhood, cliente.city, cliente.state].filter(Boolean).join(", ")}</span>
                      </div>
                    )}
                    {cliente.birthdate && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>Nascimento: {fmt(cliente.birthdate)}</span>
                      </div>
                    )}
                    {cliente.profession && (
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>{cliente.profession}</span>
                      </div>
                    )}
                    {cliente.rg_numero && (
                      <div className="flex items-center gap-2 text-sm">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>RG: {cliente.rg_numero}</span>
                      </div>
                    )}
                    {cliente.marital_status && (
                      <div className="flex items-center gap-2 text-sm">
                        <User2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>Estado civil: {cliente.marital_status}</span>
                      </div>
                    )}
                    {cliente.email_exclusivo && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="text-blue-600 dark:text-blue-400">{cliente.email_exclusivo}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Notas */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BookOpen className="w-4 h-4" /> Notas do cliente
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {notasLoading && <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">Carregando notas...</span></div>}

                    {!notasLoading && (!notasData?.notes || notasData.notes.length === 0) && (
                      <p className="text-xs text-muted-foreground">Nenhuma nota para este cliente.</p>
                    )}

                    <div className="space-y-2">
                      {notasData?.notes?.map((n: any) => (
                        <div key={n.id} className="group flex items-start gap-2 p-2 rounded-md bg-muted/30 text-sm" data-testid={`nota-${n.id}`}>
                          <div className="flex-1 min-w-0">
                            <p className="whitespace-pre-wrap">{n.content}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {n.user?.name} â {n.created_at ? new Date(n.created_at).toLocaleString("pt-BR") : ""}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-6 h-6 opacity-0 group-hover:opacity-100 shrink-0"
                            onClick={() => deleteNotaMutation.mutate(n.id)}
                            data-testid={`button-delete-nota-${n.id}`}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    {!firstUserId && (
                      <p className="text-xs text-amber-600">Configure o token para criar notas (necessÃ¡rio ID de usuÃ¡rio).</p>
                    )}

                    <div className="space-y-2">
                      <Textarea
                        placeholder="Escreva uma nota..."
                        value={newNota}
                        onChange={(e) => setNewNota(e.target.value)}
                        rows={2}
                        className="text-sm resize-none"
                        data-testid="input-nova-nota"
                      />
                      <Button
                        size="sm"
                        onClick={() => createNotaMutation.mutate()}
                        disabled={!newNota.trim() || !firstUserId || createNotaMutation.isPending}
                        data-testid="button-criar-nota"
                      >
                        {createNotaMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                        Adicionar nota
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-2">
                  <Link href={`/?cliente=${encodeURIComponent(cliente.name)}&cpf=${encodeURIComponent(cliente.cpf_cnpj || "")}`}>
                    <Button size="sm" className="gap-1.5" data-testid="button-usar-ia">
                      <Gavel className="w-4 h-4" />
                      Usar IA com este cliente
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </div>
        )}

        {/* ââ TAB: ConfiguraÃ§Ãµes âââââââââââââââââââââââââââââââââââââââââââââ */}
        {tab === "configuracoes" && (
          <div className="p-4 max-w-2xl mx-auto space-y-4">
            <h2 className="font-semibold">ConfiguraÃ§Ãµes da IntegraÃ§Ã£o</h2>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Key className="w-4 h-4" /> Token de API
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">Passo a passo para obter o token:</p>
                  <ol className="text-xs text-blue-700 dark:text-blue-300 space-y-1.5 list-decimal list-inside">
                    <li>FaÃ§a login em <a href="https://planilha.tramitacaointeligente.com.br/usuarios/login" target="_blank" rel="noopener noreferrer" className="underline font-medium">planilha.tramitacaointeligente.com.br</a></li>
                    <li>VÃ¡ direto para <a href="https://planilha.tramitacaointeligente.com.br/api/chaves" target="_blank" rel="noopener noreferrer" className="underline font-medium">planilha.tramitacaointeligente.com.br/api/chaves</a></li>
                    <li>Clique em "Nova chave" ou "Gerar chave de API"</li>
                    <li>Copie a chave gerada (string longa com letras e nÃºmeros)</li>
                    <li>Cole abaixo e clique em Salvar</li>
                  </ol>
                  <div className="pt-1 space-y-1">
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">â ï¸ IMPORTANTE: Chave de API â  Webhook</p>
                    <p className="text-[11px] text-blue-600 dark:text-blue-400">A chave da API Ã© gerada em <strong>/api/chaves</strong> â pÃ¡gina diferente dos webhooks. SÃ£o coisas separadas.</p>
                    <p className="text-[11px] text-blue-600 dark:text-blue-400">O token correto Ã© uma string longa como <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">Eqef2u4Matqi9C...</code> â nunca sÃ³ nÃºmeros.</p>
                  </div>
                </div>

                {settingLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <div className="space-y-2">
                    {savedToken && /^\d+$/.test(savedToken.trim()) && (
                      <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Token incorreto detectado</p>
                          <p className="text-xs text-amber-700 dark:text-amber-300">O valor "{savedToken}" parece ser um ID de assinante. Substitua pelo Token Bearer da sua conta.</p>
                        </div>
                      </div>
                    )}
                    {savedToken && !/^\d+$/.test(savedToken.trim()) && (
                      <div className="flex items-center gap-2 p-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        <p className="text-xs text-green-700 dark:text-green-300">Token configurado: {savedToken.slice(0, 8)}...{savedToken.slice(-4)}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showToken ? "text" : "password"}
                          placeholder={savedToken ? "Novo token (deixe em branco para manter)" : "Cole o Token Bearer aqui"}
                          value={tokenInput}
                          onChange={(e) => { setTokenInput(e.target.value); setTestResult(null); }}
                          className="pr-8"
                          data-testid="input-token"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowToken(!showToken)}
                        >
                          {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button
                        onClick={() => saveTokenMutation.mutate()}
                        disabled={!tokenInput || saveTokenMutation.isPending}
                        data-testid="button-save-token"
                      >
                        {saveTokenMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
                      </Button>
                    </div>
                    {savedToken && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTestConnection}
                        disabled={testLoading}
                        className="w-full gap-1.5 text-xs"
                        data-testid="button-test-connection"
                      >
                        {testLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Testar ConexÃ£o com TramitaÃ§Ã£o Inteligente
                      </Button>
                    )}
                    {testResult && (
                      <div className={`flex items-start gap-2 p-3 rounded-md border text-xs ${testResult.ok ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200" : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"}`}>
                        {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-600" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />}
                        <p>{testResult.message}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bell className="w-4 h-4" /> Webhook â PublicaÃ§Ãµes DJE
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Configure este endereÃ§o no TramitaÃ§Ã£o Inteligente para receber publicaÃ§Ãµes do DiÃ¡rio de JustiÃ§a automaticamente.
                  Acesse <a href="https://planilha.tramitacaointeligente.com.br/api/webhooks/endpoints" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ConfiguraÃ§Ãµes â Webhooks</a> e adicione a URL abaixo para o evento <strong>publications.created</strong>.
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-2 py-1.5 rounded border flex-1 overflow-x-auto">
                    {webhookUrl}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyWebhook} data-testid="button-copy-webhook-config">
                    {webhookCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Scale className="w-4 h-4" /> O que esta integraÃ§Ã£o oferece
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { icon: Bell, text: "PublicaÃ§Ãµes do DJE â recebe notificaÃ§Ãµes em tempo real quando hÃ¡ publicaÃ§Ãµes do seu nÃºmero OAB" },
                  { icon: Users, text: "Clientes â visualiza e gerencia todos os seus clientes do TramitaÃ§Ã£o Inteligente" },
                  { icon: BookOpen, text: "Notas â cria e consulta notas vinculadas a cada cliente" },
                  { icon: Gavel, text: "IA integrada â usa o assistente jurÃ­dico com os dados do cliente preenchidos" },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">{text}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
