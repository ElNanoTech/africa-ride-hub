import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/routeClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GraduationCap, PlayCircle, CheckCircle2, Clock, Award, ArrowLeft, HelpCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const CAT_LABELS: Record<string, string> = {
  safety: "Sécurité", driving: "Conduite", customer_service: "Service client",
  financial: "Finance", platform: "Plateforme", other: "Autre",
};

function toEmbed(url: string): string {
  if (!url) return "";
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  return url;
}

type QuizQuestion = { question: string; options: string[]; correct_index: number; explanation?: string };
const PASS_THRESHOLD = 70;

function parseQuiz(raw: unknown): QuizQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((q): q is QuizQuestion =>
    !!q && typeof q.question === "string" && Array.isArray(q.options) && q.options.length >= 2 && typeof q.correct_index === "number"
  );
}

export default function Formation() {
  const navigate = useNavigate();
  const [modules, setModules] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<any | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [quizMode, setQuizMode] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizResult, setQuizResult] = useState<{ score: number; passed: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: drv } = await supabase
        .from("drivers")
        .select("id")
        .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
        .maybeSingle();
      if (!drv) { setLoading(false); return; }
      setDriverId(drv.id);
      const [mods, prog] = await Promise.all([
        supabase.from("training_modules").select("*").eq("is_published", true).order("order_index"),
        supabase.from("training_progress").select("*").eq("driver_id", drv.id),
      ]);
      setModules(mods.data ?? []);
      const map: Record<string, any> = {};
      (prog.data ?? []).forEach((p: any) => { map[p.module_id] = p; });
      setProgress(map);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const done = Object.values(progress).filter((p: any) => p.status === "completed").length;
    return { done, total: modules.length, pct: modules.length ? Math.round((done / modules.length) * 100) : 0 };
  }, [progress, modules]);

  const startModule = async (m: any) => {
    if (!driverId) return;
    setActive(m);
    setQuizMode(false);
    setAnswers({});
    setQuizResult(null);
    const existing = progress[m.id];
    if (!existing) {
      const { data } = await supabase.from("training_progress")
        .insert({ driver_id: driverId, module_id: m.id, status: "in_progress", started_at: new Date().toISOString(), progress_percent: 10 })
        .select().single();
      if (data) setProgress({ ...progress, [m.id]: data });
    } else if (existing.status === "not_started") {
      await supabase.from("training_progress").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", existing.id);
    }
  };

  const persistCompletion = async (m: any, scoreValue?: number) => {
    if (!driverId) return;
    const existing = progress[m.id];
    const payload: Record<string, unknown> = { status: "completed", progress_percent: 100, completed_at: new Date().toISOString() };
    if (typeof scoreValue === "number") payload.score = scoreValue;
    let updated;
    if (existing) {
      const { data } = await supabase.from("training_progress").update(payload).eq("id", existing.id).select().single();
      updated = data;
    } else {
      const { data } = await supabase.from("training_progress").insert({ driver_id: driverId, module_id: m.id, ...payload }).select().single();
      updated = data;
    }
    if (updated) {
      setProgress({ ...progress, [m.id]: updated });
      toast.success("Module terminé ! Bravo 🎉");
      setActive(null);
    }
  };

  const submitQuiz = async (m: any) => {
    const questions = parseQuiz(m.quiz);
    if (questions.length === 0) return;
    const correct = questions.reduce((n, q, i) => n + (answers[i] === q.correct_index ? 1 : 0), 0);
    const pct = Math.round((correct / questions.length) * 100);
    const passed = pct >= PASS_THRESHOLD;
    setQuizResult({ score: pct, passed });
    if (passed) {
      await persistCompletion(m, pct);
    } else {
      toast.error(`Score: ${pct}%. Il faut au moins ${PASS_THRESHOLD}% pour valider.`);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-4 shadow-md">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/driver")} className="text-primary-foreground hover:bg-primary-foreground/10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2"><GraduationCap className="h-5 w-5" /> Formation</h1>
            <p className="text-xs opacity-90">Apprenez et améliorez votre score</p>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span>Progression</span>
            <span>{stats.done}/{stats.total} modules</span>
          </div>
          <Progress value={stats.pct} className="h-2 bg-primary-foreground/20" />
        </div>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-center py-10 text-muted-foreground">Chargement…</p>
        ) : modules.length === 0 ? (
          <Card><CardContent className="py-10 text-center">
            <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Aucun module disponible pour l'instant</p>
          </CardContent></Card>
        ) : modules.map((m) => {
          const p = progress[m.id];
          const status = p?.status ?? "not_started";
          return (
            <Card key={m.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 ${status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-950" : "bg-primary/10 text-primary"}`}>
                    {status === "completed" ? <CheckCircle2 className="h-6 w-6" /> : <PlayCircle className="h-6 w-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold truncate">{m.title}</h3>
                      {m.is_mandatory && <Badge variant="outline" className="text-[10px]">Obligatoire</Badge>}
                    </div>
                    {m.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{m.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {m.duration_minutes} min</span>
                      <span>{CAT_LABELS[m.category] ?? m.category}</span>
                    </div>
                    <Button size="sm" className="mt-3 w-full" variant={status === "completed" ? "outline" : "default"} onClick={() => startModule(m)}>
                      {status === "completed" ? "Revoir" : status === "in_progress" ? "Continuer" : "Commencer"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {stats.pct === 100 && stats.total > 0 && (
          <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30 border-yellow-200">
            <CardContent className="py-6 text-center">
              <Award className="h-12 w-12 mx-auto text-yellow-600 mb-2" />
              <p className="font-bold text-lg">Bravo !</p>
              <p className="text-sm text-muted-foreground">Vous avez terminé toutes les formations.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader><DialogTitle>{active.title}</DialogTitle></DialogHeader>
              {!quizMode ? (
                <>
                  {active.video_url && (
                    <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
                      <iframe src={toEmbed(active.video_url)} className="w-full h-full" allowFullScreen title={active.title} />
                    </div>
                  )}
                  {active.content && <p className="text-sm whitespace-pre-line">{active.content}</p>}
                  {active.description && !active.content && <p className="text-sm text-muted-foreground">{active.description}</p>}
                  {parseQuiz(active.quiz).length > 0 ? (
                    <Button size="lg" className="w-full mt-2" onClick={() => { setQuizMode(true); setAnswers({}); setQuizResult(null); }}>
                      <HelpCircle className="h-5 w-5 mr-2" /> Passer le quiz ({parseQuiz(active.quiz).length} questions)
                    </Button>
                  ) : (
                    <Button size="lg" className="w-full mt-2" onClick={() => persistCompletion(active)}>
                      <CheckCircle2 className="h-5 w-5 mr-2" /> J'ai terminé
                    </Button>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <HelpCircle className="h-4 w-4" />
                    Quiz · {PASS_THRESHOLD}% requis pour valider
                  </div>
                  {parseQuiz(active.quiz).map((q, qi) => {
                    const picked = answers[qi];
                    return (
                      <div key={qi} className="space-y-2">
                        <p className="font-medium text-sm">{qi + 1}. {q.question}</p>
                        <div className="space-y-2">
                          {q.options.map((opt, oi) => {
                            const isPicked = picked === oi;
                            const showResult = quizResult !== null;
                            const isCorrect = oi === q.correct_index;
                            const cls = showResult
                              ? isCorrect
                                ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                                : isPicked
                                  ? "border-destructive bg-destructive/10"
                                  : "border-border"
                              : isPicked
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/50";
                            return (
                              <button
                                key={oi}
                                type="button"
                                disabled={quizResult !== null}
                                onClick={() => setAnswers({ ...answers, [qi]: oi })}
                                className={`w-full text-left text-sm rounded-lg border-2 px-3 py-2 transition-colors ${cls}`}
                              >
                                <span className="flex items-center justify-between gap-2">
                                  <span>{opt}</span>
                                  {quizResult !== null && isCorrect && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                                  {quizResult !== null && isPicked && !isCorrect && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {quizResult !== null && q.explanation && (
                          <p className="text-xs text-muted-foreground italic">{q.explanation}</p>
                        )}
                      </div>
                    );
                  })}
                  {quizResult === null ? (
                    <Button
                      size="lg"
                      className="w-full"
                      disabled={Object.keys(answers).length < parseQuiz(active.quiz).length}
                      onClick={() => submitQuiz(active)}
                    >
                      Valider mes réponses
                    </Button>
                  ) : quizResult.passed ? (
                    <div className="text-center py-2">
                      <CheckCircle2 className="h-10 w-10 mx-auto text-green-600 mb-1" />
                      <p className="font-semibold">Réussi · {quizResult.score}%</p>
                    </div>
                  ) : (
                    <Button size="lg" variant="outline" className="w-full" onClick={() => { setAnswers({}); setQuizResult(null); }}>
                      Réessayer le quiz
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}