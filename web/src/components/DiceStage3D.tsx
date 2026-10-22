"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function DiceStage3D({
  tipo,
  rolling,
  total,
  color = "#f5b544",
}: {
  tipo: string;
  rolling: boolean;
  total: number | null;
  color?: string;
}) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const grupoRef = useRef<THREE.Group | null>(null);
  const rollingRef = useRef(rolling);
  const targetRef = useRef({ x: 0.45, y: 0.7, z: 0.15 });
  const escenaRef = useRef<THREE.Scene | null>(null);

  useEffect(() => {
    rollingRef.current = rolling;
    if (rolling) {
      targetRef.current = {
        x: Math.random() * 6 - 3,
        y: Math.random() * 6 - 3,
        z: Math.random() * 2 - 1,
      };
    } else if (total !== null) {
      targetRef.current = {
        x: 0.32 + ((total % 5) * Math.PI) / 18,
        y: 0.65 + ((total % 7) * Math.PI) / 24,
        z: 0.05,
      };
    }
  }, [rolling, total]);

  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;

    const escena = new THREE.Scene();
    escenaRef.current = escena;
    const camara = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camara.position.set(0, 0.6, 5.4);
    camara.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    nodo.appendChild(renderer.domElement);

    const grupo = new THREE.Group();
    escena.add(grupo);
    grupoRef.current = grupo;

    const ambiente = new THREE.AmbientLight(0xffffff, 1.15);
    escena.add(ambiente);
    const clave = new THREE.DirectionalLight(0xfff0c8, 2.4);
    clave.position.set(3, 5, 4);
    escena.add(clave);
    const relleno = new THREE.PointLight(0x8b5cf6, 12, 12);
    relleno.position.set(-3, -2, 3);
    escena.add(relleno);

    const suelo = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 48),
      new THREE.MeshStandardMaterial({ color: 0x0b0d12, transparent: true, opacity: 0.55 }),
    );
    suelo.rotation.x = -Math.PI / 2;
    suelo.position.y = -1.55;
    escena.add(suelo);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.55, 1.62, 64),
      new THREE.MeshBasicMaterial({ color: 0xf5b544, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -1.54;
    escena.add(halo);

    let frame = 0;
    let vivo = true;
    const animar = () => {
      if (!vivo) return;
      frame = requestAnimationFrame(animar);
      const mesh = meshRef.current;
      if (mesh) {
        if (rollingRef.current) {
          mesh.rotation.x += 0.16;
          mesh.rotation.y += 0.22;
          mesh.rotation.z += 0.11;
          mesh.position.y = Math.sin(Date.now() / 120) * 0.18;
        } else {
          const t = targetRef.current;
          mesh.rotation.x += (t.x - mesh.rotation.x) * 0.065;
          mesh.rotation.y += (t.y - mesh.rotation.y) * 0.065;
          mesh.rotation.z += (t.z - mesh.rotation.z) * 0.065;
          mesh.position.y += (0 - mesh.position.y) * 0.08;
        }
      }
      halo.rotation.z += 0.002;
      renderer.render(escena, camara);
    };
    animar();

    const ajustar = () => {
      const ancho = nodo.clientWidth || 280;
      const alto = nodo.clientHeight || 210;
      renderer.setSize(ancho, alto, false);
      camara.aspect = ancho / alto;
      camara.updateProjectionMatrix();
    };
    ajustar();
    const observer = new ResizeObserver(ajustar);
    observer.observe(nodo);

    return () => {
      vivo = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      if (renderer.domElement.parentNode === nodo) nodo.removeChild(renderer.domElement);
      escena.clear();
      meshRef.current = null;
    };
  }, []);

  useEffect(() => {
    const grupo = grupoRef.current;
    if (!grupo) return;
    if (meshRef.current) {
      grupo.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      const material = meshRef.current.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
      meshRef.current = null;
    }
    const caras = Number(tipo.replace(/\D/g, "")) || 20;
    let geometria: THREE.BufferGeometry;
    if (tipo === "d4") geometria = new THREE.TetrahedronGeometry(1.15);
    else if (tipo === "d6") geometria = new THREE.BoxGeometry(1.45, 1.45, 1.45);
    else if (tipo === "d8") geometria = new THREE.OctahedronGeometry(1.2);
    else if (tipo === "d10") geometria = new THREE.CylinderGeometry(1.05, 1.05, 1.25, 10);
    else if (tipo === "d12") geometria = new THREE.DodecahedronGeometry(1.18);
    else if (tipo === "d100") geometria = new THREE.IcosahedronGeometry(1.25, 1);
    else if (tipo === "dF") geometria = new THREE.TetrahedronGeometry(1.2);
    else if (caras >= 20) geometria = new THREE.IcosahedronGeometry(1.2);
    else geometria = new THREE.DodecahedronGeometry(1.15);

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.55,
      roughness: 0.26,
      flatShading: true,
      emissive: new THREE.Color(color).multiplyScalar(0.12),
    });
    const mesh = new THREE.Mesh(geometria, material);
    mesh.castShadow = true;
    if (tipo === "d10") mesh.rotation.z = Math.PI / 10;
    const aristas = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometria, 18),
      new THREE.LineBasicMaterial({ color: 0x0b0d12, transparent: true, opacity: 0.8 }),
    );
    mesh.add(aristas);
    grupo.add(mesh);
    meshRef.current = mesh;
  }, [tipo, color]);

  return (
    <div className="relative h-[210px] w-full overflow-hidden rounded-xl border border-line bg-[radial-gradient(circle_at_50%_35%,rgba(245,181,68,0.10),transparent_60%)]">
      <div ref={contenedor} className="absolute inset-0" />
      {!rolling && total !== null ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="animate-pop rounded-full border border-gold/40 bg-ink/80 px-4 py-1 font-display text-3xl text-gold shadow-glow backdrop-blur">
            {total}
          </span>
        </div>
      ) : null}
      <span className="absolute bottom-2 left-3 text-[9px] uppercase tracking-[0.25em] text-slate-500">
        three.js · resultado autoritativo
      </span>
    </div>
  );
}
