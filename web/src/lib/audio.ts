"use client";

export interface Sonido {
  id: number;
  nombre: string;
  grupo: string;
  src: string;
  loop: boolean;
  volumen: number;
  sintetico: boolean;
}

type Reproduccion =
  | { kind: "web"; gain: GainNode; stop: () => void }
  | { kind: "html"; audio: HTMLAudioElement; stop: () => void };

type AudioContextCtor = typeof AudioContext;

function ctxCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext || w.webkitAudioContext || null;
}

function bufferRuido(ctx: AudioContext, segundos = 3): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * segundos, ctx.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < datos.length; i += 1) datos[i] = Math.random() * 2 - 1;
  return buffer;
}

function fuenteRuido(ctx: AudioContext, segundos = 3): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = bufferRuido(ctx, segundos);
  src.loop = true;
  return src;
}

function construirSintesis(ctx: AudioContext, src: string, destino: GainNode): () => void {
  const paradas: Array<() => void> = [];
  const lfo = (frecuencia: number, minimo: number, maximo: number, parametro: AudioParam) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frecuencia;
    gain.gain.value = (maximo - minimo) / 2;
    parametro.value = (maximo + minimo) / 2;
    osc.connect(gain).connect(parametro);
    osc.start();
    paradas.push(() => {
      try { osc.stop(); } catch { /* ya parado */ }
      osc.disconnect();
      gain.disconnect();
    });
  };

  const ruidoFiltrado = (tipo: BiquadFilterType, frecuencia: number, q: number, volumen: number) => {
    const ruido = fuenteRuido(ctx);
    const filtro = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filtro.type = tipo;
    filtro.frequency.value = frecuencia;
    filtro.Q.value = q;
    gain.gain.value = volumen;
    ruido.connect(filtro).connect(gain).connect(destino);
    ruido.start();
    paradas.push(() => {
      try { ruido.stop(); } catch { /* ya parado */ }
      ruido.disconnect();
      filtro.disconnect();
      gain.disconnect();
    });
    return { filtro, gain };
  };

  const drone = (frecuencias: number[], tipo: OscillatorType, volumen: number, corte = 800) => {
    const filtro = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filtro.type = "lowpass";
    filtro.frequency.value = corte;
    gain.gain.value = volumen;
    filtro.connect(gain).connect(destino);
    const oscs: OscillatorNode[] = [];
    frecuencias.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = tipo;
      osc.frequency.value = f;
      osc.detune.value = i * 4 - 2;
      osc.connect(filtro);
      osc.start();
      oscs.push(osc);
    });
    paradas.push(() => {
      oscs.forEach((o) => {
        try { o.stop(); } catch { /* ya parado */ }
        o.disconnect();
      });
      filtro.disconnect();
      gain.disconnect();
    });
    return gain;
  };

  if (src === "synth:bosque") {
    const { gain: gainRuido, filtro } = ruidoFiltrado("bandpass", 1000, 0.7, 0.035);
    lfo(0.09, 0.015, 0.06, gainRuido.gain);
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.frequency.value = 1300;
    oscGain.gain.value = 0;
    osc.connect(oscGain).connect(destino);
    osc.start();
    const trino = window.setInterval(() => {
      const ahora = ctx.currentTime;
      osc.frequency.setValueAtTime(1500 + Math.random() * 500, ahora);
      osc.frequency.exponentialRampToValueAtTime(2200 + Math.random() * 400, ahora + 0.18);
      oscGain.gain.cancelScheduledValues(ahora);
      oscGain.gain.setValueAtTime(0.0001, ahora);
      oscGain.gain.exponentialRampToValueAtTime(0.035, ahora + 0.02);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, ahora + 0.35);
      filtro.frequency.setTargetAtTime(1300, ahora, 0.5);
    }, 7000 + Math.random() * 5000);
    paradas.push(() => {
      window.clearInterval(trino);
      try { osc.stop(); } catch { /* ya parado */ }
      osc.disconnect();
      oscGain.disconnect();
    });
  } else if (src === "synth:lluvia") {
    const { gain } = ruidoFiltrado("highpass", 1200, 0.5, 0.075);
    lfo(0.04, 0.055, 0.09, gain.gain);
  } else if (src === "synth:cripta") {
    drone([48, 72.5, 96], "sine", 0.05, 220);
    const { gain } = ruidoFiltrado("lowpass", 240, 0.6, 0.015);
    lfo(0.06, 0.008, 0.02, gain.gain);
  } else if (src === "synth:mercado") {
    const { gain } = ruidoFiltrado("bandpass", 520, 1.1, 0.04);
    lfo(0.37, 0.02, 0.07, gain.gain);
    drone([196, 247], "triangle", 0.015, 700);
  } else if (src === "synth:combate") {
    const gain = drone([55, 82.5], "sawtooth", 0.03, 260);
    lfo(1.9, 0.008, 0.055, gain.gain);
    const { gain: pulso } = ruidoFiltrado("lowpass", 180, 0.8, 0.025);
    lfo(1.9, 0.002, 0.04, pulso.gain);
  } else if (src === "synth:taberna") {
    drone([196, 293.7, 392], "triangle", 0.025, 900);
    const { gain } = ruidoFiltrado("bandpass", 400, 0.9, 0.025);
    lfo(0.13, 0.012, 0.038, gain.gain);
  } else if (src === "synth:viento") {
    const { gain, filtro } = ruidoFiltrado("bandpass", 380, 0.6, 0.05);
    lfo(0.12, 0.012, 0.075, gain.gain);
    lfo(0.05, 250, 700, filtro.frequency);
  } else {
    drone([220], "sine", 0.03, 1200);
  }

  return () => paradas.forEach((parar) => parar());
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private activos = new Map<number, Reproduccion>();
  private deseado: Sonido[] | null = null;
  private _muted = false;
  private volumenMaestro = 0.75;

  get soportado(): boolean {
    return ctxCtor() !== null;
  }

  get muted(): boolean {
    return this._muted;
  }

  async init(): Promise<boolean> {
    const Ctor = ctxCtor();
    if (!Ctor) return false;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : this.volumenMaestro;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      try { await this.ctx.resume(); } catch { return false; }
    }
    if (this.ctx.state === "running" && this.deseado) {
      this.aplicarDeseado();
    }
    return this.ctx.state === "running";
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : this.volumenMaestro, this.ctx.currentTime, 0.08);
    }
  }

  setVolumenMaestro(volumen: number): void {
    this.volumenMaestro = Math.max(0, Math.min(1, volumen));
    if (this.master && this.ctx && !this._muted) {
      this.master.gain.setTargetAtTime(this.volumenMaestro, this.ctx.currentTime, 0.08);
    }
  }

  estaSonando(id: number): boolean {
    return this.activos.has(id);
  }

  idsActivos(): number[] {
    return Array.from(this.activos.keys());
  }

  async play(sound: Sonido, fade = 1.2): Promise<void> {
    if (!(await this.init()) || !this.ctx || !this.master) return;
    if (this.activos.has(sound.id)) return;
    const ctx = this.ctx;
    const volumen = Math.max(0, Math.min(1, sound.volumen ?? 0.6));

    if (sound.src.startsWith("synth:")) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.master);
      const pararSintesis = construirSintesis(ctx, sound.src, gain);
      gain.gain.setTargetAtTime(volumen * 0.55, ctx.currentTime, Math.max(0.05, fade / 3));
      this.activos.set(sound.id, {
        kind: "web",
        gain,
        stop: () => {
          gain.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
          window.setTimeout(() => {
            pararSintesis();
            gain.disconnect();
          }, 1200);
        },
      });
      return;
    }

    const audio = new Audio(sound.src);
    audio.loop = sound.loop;
    audio.crossOrigin = "anonymous";
    audio.volume = 0;
    const objetivo = volumen * 0.8;
    let parado = false;
    const subir = window.setInterval(() => {
      if (parado) return;
      audio.volume = Math.min(objetivo, audio.volume + Math.max(0.02, objetivo / 20));
      if (audio.volume >= objetivo) window.clearInterval(subir);
    }, 60);
    try {
      await audio.play();
    } catch {
      window.clearInterval(subir);
      return;
    }
    this.activos.set(sound.id, {
      kind: "html",
      audio,
      stop: () => {
        parado = true;
        window.clearInterval(subir);
        const bajar = window.setInterval(() => {
          audio.volume = Math.max(0, audio.volume - 0.05);
          if (audio.volume <= 0.001) {
            window.clearInterval(bajar);
            audio.pause();
            audio.src = "";
          }
        }, 50);
      },
    });
  }

  stop(id: number): void {
    const rep = this.activos.get(id);
    if (!rep) return;
    rep.stop();
    this.activos.delete(id);
  }

  toggle(sound: Sonido): void {
    if (this.activos.has(sound.id)) this.stop(sound.id);
    else void this.play(sound.id ? sound : sound);
  }

  stopAll(): void {
    for (const id of Array.from(this.activos.keys())) this.stop(id);
    this.deseado = null;
  }

  setEscena(sounds: Sonido[]): void {
    this.deseado = sounds;
    if (this.ctx?.state === "running") this.aplicarDeseado();
  }

  private aplicarDeseado(): void {
    const deseados = this.deseado || [];
    const ids = new Set(deseados.map((s) => s.id));
    for (const id of Array.from(this.activos.keys())) {
      if (!ids.has(id)) this.stop(id);
    }
    deseados.forEach((s) => {
      if (!this.activos.has(s.id)) void this.play(s, 1.8);
    });
  }
}

export const audioEngine = new AudioEngine();
