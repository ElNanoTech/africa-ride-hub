import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GraduationCap, PlayCircle, CheckCircle2, Clock, Award, ArrowLeft } from "lucide-react";
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

export default function Formation() {
  const navigate = useNavigate();
  const [modules, setModules] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<any | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: drv } = await supabase.from("drivers").select("id").eq("user_id", user.id).maybeSingle();
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

  const markComplete = async (m: any) => {
    if (!driverId) return;
    const existing = progress[m.id];
    const payload = { status: "completed", progress_percent: 100, completed_at: new Date().toISOString() };
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
              {active.video_url && (
                <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
                  <iframe src={toEmbed(active.video_url)} className="w-full h-full" allowFullScreen title={active.title} />
                </div>
              )}
              {active.content && <p className="text-sm whitespace-pre-line">{active.content}</p>}
              {active.description && !active.content && <p className="text-sm text-muted-foreground">{active.description}</p>}
              <Button size="lg" className="w-full mt-2" onClick={() => markComplete(active)}>
                <CheckCircle2 className="h-5 w-5 mr-2" /> J'ai terminé
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}