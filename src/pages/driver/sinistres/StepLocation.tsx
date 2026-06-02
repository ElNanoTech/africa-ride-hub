import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Send, MapPin, Loader2, RefreshCw, Car, Smartphone, AlertCircle, Mic, Square, Trash2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { AccidentWizardLayout } from '@/components/sinistres/AccidentWizardLayout';
import { AccidentMap } from '@/components/sinistres/AccidentMap';
import {
  useAccident,
  useAccidentFiles,
  useUpdateAccident,
  useUploadAccidentFile,
  useSubmitAccident,
  geohashEncode,
  reverseGeocode,
} from '@/hooks/useSinistres';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { useVehicleGpsPosition, formatPositionAge } from '@/hooks/useVehicleGpsPosition';
import { supabase } from '@/integrations/supabase/routeClient';
import { LoadingState } from '@/components/LoadingState';
import { toast } from 'sonner';

export default function StepLocation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { driverProfile } = useDriverAuth();
  const { data: accident, isLoading } = useAccident(id);
  const { data: files = [] } = useAccidentFiles(id);
  const update = useUpdateAccident();
  const uploadFile = useUploadAccidentFile();
  const submit = useSubmitAccident();

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [locating, setLocating] = useState(false);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);
  const [autoApplied, setAutoApplied] = useState(false);
  const [accidentDatetime, setAccidentDatetime] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [description, setDescription] = useState('');

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resolve vehicle: prefer accident.vehicle_id, fall back to driver.active_vehicle_id
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (accident?.vehicle_id) {
        if (!cancelled) setActiveVehicleId(accident.vehicle_id);
        return;
      }
      if (!driverProfile?.id) return;
      const { data } = await supabase
        .from('drivers')
        .select('active_vehicle_id')
        .eq('id', driverProfile.id)
        .maybeSingle();
      if (!cancelled) setActiveVehicleId((data as any)?.active_vehicle_id ?? null);
    })();
    return () => { cancelled = true; };
  }, [accident?.vehicle_id, driverProfile?.id]);

  const { position: vehiclePos, loading: vehLoading, refresh: refreshVehicle } = useVehicleGpsPosition(activeVehicleId);

  useEffect(() => {
    if (accident) {
      setLat(accident.location_lat);
      setLng(accident.location_lng);
      setAddress(accident.location_address ?? '');
      setCity(accident.city ?? '');
      setRegion(accident.region ?? '');
      setDescription(accident.description ?? '');
      // Pre-fill datetime from the draft (defaulted to creation time)
      setAccidentDatetime(new Date(accident.accident_datetime).toISOString().slice(0, 16));
    }
  }, [accident?.id]);

  // AUTO-APPLY vehicle GPS as soon as we have it (driver doesn't need to tap)
  useEffect(() => {
    if (autoApplied) return;
    if (lat != null && lng != null) return; // already have a position
    if (!vehiclePos) return;
    setLat(vehiclePos.lat);
    setLng(vehiclePos.lng);
    setAutoApplied(true);
    (async () => {
      try {
        const geo = await reverseGeocode(vehiclePos.lat, vehiclePos.lng);
        if (geo.address && !address) setAddress(geo.address);
        if (geo.city && !city) setCity(geo.city);
        if (geo.region && !region) setRegion(geo.region);
      } catch {}
    })();
  }, [vehiclePos, autoApplied, lat, lng]);

  // Fallback to phone GPS if no vehicle position
  useEffect(() => {
    if (autoApplied) return;
    if (lat != null && lng != null) return;
    if (vehLoading) return;
    if (vehiclePos) return; // vehicle effect will run
    if (!('geolocation' in navigator)) return;
    setLocating(true);
    setAutoApplied(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        try {
          const geo = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          if (geo.address) setAddress(geo.address);
          if (geo.city) setCity(geo.city);
          if (geo.region) setRegion(geo.region);
        } catch {}
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [vehLoading, vehiclePos, autoApplied, lat, lng]);

  const detectPhoneLocation = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Géolocalisation non disponible');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        const geo = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (geo.address) setAddress(geo.address);
        if (geo.city) setCity(geo.city);
        if (geo.region) setRegion(geo.region);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        toast.error('Localisation échouée', { description: err.message });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // ---------- VOICE RECORDING ----------
  const startRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
      chunksRef.current = [];
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setVoiceBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start(100);
      setIsRecording(true);
      setVoiceBlob(null);
      setVoiceDuration(0);
      timerRef.current = setInterval(() => setVoiceDuration((d) => d + 1), 1000);
    } catch {
      toast.error('Accès au micro refusé');
    }
  };

  const stopRecord = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const discardVoice = () => { setVoiceBlob(null); setVoiceDuration(0); };

  // ---------- SUBMIT ----------
  const photoCount = files.filter((f) => f.file_type === 'PHOTO').length;
  const hasLocation = lat != null && lng != null;
  const canSubmit = photoCount >= 1;

  const handleSubmit = async () => {
    if (!id) return;
    if (!canSubmit) {
      toast.error('Veuillez ajouter au moins 1 photo');
      return;
    }
    try {
      // 1. Persist location, datetime, description, vehicle (all optional)
      await update.mutateAsync({
        id,
        patch: {
          location_lat: lat,
          location_lng: lng,
          location_address: address || null,
          city: city || null,
          region: region || null,
          location_geohash: lat != null && lng != null ? geohashEncode(lat, lng) : null,
          accident_datetime: new Date(accidentDatetime).toISOString(),
          description: description.trim() || null,
          ...(accident?.vehicle_id || !activeVehicleId ? {} : { vehicle_id: activeVehicleId }),
        },
      });

      // 2. Upload voice note as a file (file_type = VIDEO marker for audio? we use VOICE via existing flow)
      if (voiceBlob) {
        const file = new File([voiceBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        try {
          await uploadFile.mutateAsync({ accidentId: id, file, checklistTag: 'voice_note' });
        } catch (e: any) {
          toast.warning('Message vocal non envoyé', { description: e.message });
        }
      }

      // 3. Submit
      const rec = await submit.mutateAsync(id);
      toast.success('Déclaration envoyée', { description: rec.case_number ?? '' });
      navigate(`/driver/sinistres/success/${rec.id}`, { replace: true });
    } catch (e: any) {
      toast.error('Échec de la soumission', { description: e.message });
    }
  };

  if (isLoading) return <LoadingState />;

  const ageLabel = vehiclePos ? formatPositionAge(vehiclePos.ageMs) : null;
  const isStale = vehiclePos && vehiclePos.ageMs > 30 * 60 * 1000;
  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <AccidentWizardLayout
      step="location"
      footer={
        <Button
          size="lg"
          className="w-full h-14 text-base"
          onClick={handleSubmit}
          disabled={!canSubmit || update.isPending || submit.isPending || uploadFile.isPending}
        >
          <Send className="h-5 w-5 mr-2" />
          {(update.isPending || submit.isPending || uploadFile.isPending) ? 'Envoi…' : 'Envoyer à l\'équipe'}
        </Button>
      }
    >
      <div className="max-w-md mx-auto space-y-4">
        <div className="text-center pt-2">
          <h2 className="text-xl font-bold">Lieu &amp; message</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Position et description (tout est optionnel).
          </p>
        </div>

        {/* Location status card — fully optional */}
        <Card className={hasLocation ? 'border-success/40 bg-success/5' : ''}>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-start gap-2 text-sm">
              {hasLocation ? (
                <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
              ) : locating || vehLoading ? (
                <Loader2 className="h-5 w-5 animate-spin shrink-0" />
              ) : (
                <MapPin className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                {hasLocation ? (
                  <>
                    <p className="font-semibold">Position (optionnel)</p>
                    {vehiclePos && lat === vehiclePos.lat && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Car className="h-3 w-3" /> GPS du véhicule {vehiclePos.vehicle_no}
                        {ageLabel && <span className={isStale ? 'text-amber-600' : ''}> · {ageLabel}</span>}
                      </p>
                    )}
                    {address && <p className="text-xs text-muted-foreground truncate mt-0.5">{address}</p>}
                  </>
                ) : (
                  <>
                    <p className="font-semibold">Position (optionnel)</p>
                    <p className="text-xs text-muted-foreground">
                      Aucune position détectée. Vous pouvez continuer sans.
                    </p>
                  </>
                )}
              </div>
              {activeVehicleId && (
                <Button size="icon" variant="ghost" onClick={refreshVehicle} disabled={vehLoading}>
                  <RefreshCw className={`h-4 w-4 ${vehLoading ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>
            {!hasLocation && !locating && (
              <Button size="sm" variant="outline" className="w-full" onClick={detectPhoneLocation}>
                <Smartphone className="h-4 w-4 mr-2" /> Utiliser ma position
              </Button>
            )}
          </CardContent>
        </Card>

        <AccidentMap lat={lat} lng={lng} height={140} />

        {/* When did it happen? */}
        <Card>
          <CardContent className="p-3 space-y-2">
            <div>
              <p className="font-semibold text-sm">Quand est-ce arrivé ?</p>
              <p className="text-xs text-muted-foreground">Date et heure approximatives.</p>
            </div>
            <input
              type="datetime-local"
              value={accidentDatetime}
              max={new Date().toISOString().slice(0, 16)}
              onChange={(e) => setAccidentDatetime(e.target.value)}
              className="w-full h-11 px-3 rounded-md border border-input bg-background text-sm"
            />
          </CardContent>
        </Card>

        {/* Optional written note */}
        <Card>
          <CardContent className="p-3 space-y-2">
            <div>
              <p className="font-semibold text-sm">Note (optionnel)</p>
              <p className="text-xs text-muted-foreground">
                Ajoutez une description écrite si vous le souhaitez.
              </p>
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex : Collision arrière à un feu rouge…"
              rows={3}
              maxLength={1000}
            />
          </CardContent>
        </Card>

        {/* Voice note (optional but encouraged) */}
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <p className="font-semibold">Message vocal (optionnel)</p>
                <p className="text-xs text-muted-foreground">Décrivez ce qui s'est passé.</p>
              </div>
              {voiceBlob && (
                <span className="text-xs font-mono bg-success/10 text-success px-2 py-1 rounded">
                  ✓ {fmtDur(voiceDuration)}
                </span>
              )}
            </div>

            {!isRecording && !voiceBlob && (
              <Button size="lg" variant="outline" className="w-full h-12" onClick={startRecord}>
                <Mic className="h-5 w-5 mr-2" /> Enregistrer un message
              </Button>
            )}
            {isRecording && (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-destructive/10 rounded-lg px-3 py-2">
                  <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  <span className="text-sm font-mono text-destructive">{fmtDur(voiceDuration)}</span>
                  <span className="text-xs text-muted-foreground">Enregistrement…</span>
                </div>
                <Button variant="destructive" size="icon" onClick={stopRecord}>
                  <Square className="h-4 w-4" />
                </Button>
              </div>
            )}
            {voiceBlob && !isRecording && (
              <div className="flex items-center gap-2">
                <audio controls src={URL.createObjectURL(voiceBlob)} className="flex-1 h-9" />
                <Button variant="ghost" size="icon" onClick={discardVoice}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit checklist */}
        <div className="text-xs text-muted-foreground space-y-1 pt-1">
          <div className="flex items-center gap-2">
            {photoCount >= 1 ? (
              <CheckCircle2 className="h-3 w-3 text-success" />
            ) : (
              <AlertCircle className="h-3 w-3 text-warning" />
            )}
            <span>Au moins 1 photo</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`h-3 w-3 ${hasLocation ? 'text-success' : 'text-muted-foreground'}`} />
            <span>{hasLocation ? 'Position ajoutée' : 'Position (optionnelle)'}</span>
          </div>
        </div>
      </div>
    </AccidentWizardLayout>
  );
}
