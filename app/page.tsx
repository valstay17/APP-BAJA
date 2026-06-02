import { GlbViewer } from "@/components/glb-viewer";
import { SensorPanel } from "@/components/sensor-panel";
import { SensorProvider } from "@/components/providers/sensor-provider";

export default function Home() {
  return (
    <SensorProvider>
      <main className="min-h-screen bg-[linear-gradient(180deg,#07111a_0%,#0d1824_42%,#f2efe8_42%,#f2efe8_100%)] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-8 px-4 py-6 lg:px-8 lg:py-8">
        <header className="flex items-center justify-between rounded-full border border-white/10 bg-slate-950/80 px-5 py-3 text-sm text-white shadow-[0_16px_40px_rgba(0,0,0,0.22)] backdrop-blur-md">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.3em] text-cyan-200/80">app baja</p>
            <p className="mt-1 font-medium">Monitor de sensores</p>
          </div>
          <div className="rounded-full border border-white/10 px-4 py-2 text-[0.68rem] uppercase tracking-[0.24em] text-white/70">
            glb preview
          </div>
        </header>

        <div className="grid flex-1 gap-4 lg:grid-cols-[0.72fr_1.28fr]">
          <section className="flex flex-col rounded-[2rem] bg-[#f2efe8] p-7 shadow-[0_30px_120px_rgba(5,7,10,0.14)] lg:p-10">
            <SensorPanel />
          </section>

          <section className="rounded-[2.2rem] border border-white/10 bg-slate-950 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.28)] lg:p-5">
            <GlbViewer />
          </section>
        </div>
      </section>
    </main>
    </SensorProvider>
  );
}
