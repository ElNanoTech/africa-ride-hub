import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Play, Pause, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface DemoStep {
  id: string;
  title: string;
  description: string;
  image: string;
  route?: string;
}

interface DemoModeProps {
  steps: DemoStep[];
  onClose: () => void;
}

const DemoMode = ({ steps, onClose }: DemoModeProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  const STEP_DURATION = 5000; // 5 seconds per step
  const PROGRESS_INTERVAL = 50; // Update every 50ms

  useEffect(() => {
    if (!isPlaying) return;

    const progressIncrement = (PROGRESS_INTERVAL / STEP_DURATION) * 100;
    
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          // Move to next step
          setCurrentStep((current) => {
            if (current < steps.length - 1) {
              return current + 1;
            } else {
              setIsPlaying(false);
              return current;
            }
          });
          return 0;
        }
        return prev + progressIncrement;
      });
    }, PROGRESS_INTERVAL);

    return () => clearInterval(interval);
  }, [isPlaying, steps.length]);

  // Reset progress when step changes manually
  useEffect(() => {
    setProgress(0);
  }, [currentStep]);

  const goToStep = (index: number) => {
    setCurrentStep(index);
    setProgress(0);
  };

  const goNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      setProgress(0);
    }
  };

  const goPrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setProgress(0);
    }
  };

  const restart = () => {
    setCurrentStep(0);
    setProgress(0);
    setIsPlaying(true);
  };

  const currentStepData = steps[currentStep];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">Interactive Demo</h2>
          <span className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {steps.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={restart} title="Restart">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-2 bg-muted/50">
        <div className="flex gap-1">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => goToStep(index)}
              className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div
                className="h-full bg-primary transition-all duration-100"
                style={{
                  width: index < currentStep ? "100%" : index === currentStep ? `${progress}%` : "0%",
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left - Info */}
        <div className="w-1/3 p-8 flex flex-col justify-center border-r bg-muted/30">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mb-4">
                <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-xl">
                  {currentStep + 1}
                </span>
              </div>
              <h3 className="text-3xl font-bold mb-4">{currentStepData.title}</h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                {currentStepData.description}
              </p>
              {currentStepData.route && (
                <div className="mt-6 p-3 bg-background rounded-lg border">
                  <span className="text-sm text-muted-foreground">Route: </span>
                  <code className="text-sm font-mono text-primary">{currentStepData.route}</code>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right - Screenshot */}
        <div className="flex-1 p-8 flex items-center justify-center bg-gradient-to-br from-muted/20 to-muted/40">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="relative max-w-4xl w-full"
            >
              <div className="rounded-xl overflow-hidden shadow-2xl border-4 border-background">
                <img
                  src={currentStepData.image}
                  alt={currentStepData.title}
                  className="w-full h-auto"
                />
              </div>
              {/* Browser-like frame */}
              <div className="absolute -top-8 left-0 right-0 h-8 bg-muted rounded-t-xl flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <div className="flex-1 mx-4 h-5 bg-background/50 rounded text-xs flex items-center justify-center text-muted-foreground">
                  dam-flotte.lovable.app{currentStepData.route || ""}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between p-4 border-t bg-background">
        <Button
          variant="outline"
          onClick={goPrev}
          disabled={currentStep === 0}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>

        <div className="flex items-center gap-2">
          {steps.map((step, index) => (
            <button
              key={step.id}
              onClick={() => goToStep(index)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                index === currentStep
                  ? "bg-primary scale-125"
                  : index < currentStep
                  ? "bg-primary/50"
                  : "bg-muted-foreground/30"
              }`}
              title={step.title}
            />
          ))}
        </div>

        <Button
          onClick={goNext}
          disabled={currentStep === steps.length - 1}
          className="gap-2"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
};

export default DemoMode;
