// Avião low-poly comum aos temas de avião (rastro branco e janela redonda).
export function makePlane(c, opts = {}) {
  const { THREE, mat, box } = c;
  const g = new THREE.Group();
  const white = mat("#f4f6f8"), blue = mat(opts.stripe || "#2f6fd1"), dark = mat("#2d3138");
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 18, 16), white); body.rotation.z = Math.PI / 2; g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), white); nose.rotation.z = -Math.PI / 2; nose.position.x = 9; nose.scale.set(1, 1.8, 1); g.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.4, 5, 16), white); tail.rotation.z = Math.PI / 2; tail.position.x = -11.5; g.add(tail);
  const stripe = box(18.2, 0.35, 2.86, blue); stripe.position.y = -0.2; g.add(stripe);
  const cock = box(0.8, 0.5, 2, dark); cock.position.set(9.4, 0.6, 0); g.add(cock);
  const wing = new THREE.Shape(); wing.moveTo(0, 0); wing.lineTo(-3.2, 11); wing.lineTo(-5.2, 11); wing.lineTo(-4.8, 0); wing.closePath();
  for (const s of [1, -1]) {
    const w = new THREE.Mesh(new THREE.ExtrudeGeometry(wing, { depth: 0.3, bevelEnabled: false }), white);
    w.rotation.x = s * Math.PI / 2; w.position.set(3, -0.6, 0); w.castShadow = true; g.add(w);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, 3.4, 14), mat("#c9ced6")); eng.rotation.z = Math.PI / 2; eng.position.set(1.4, -1.5, s * 4.6); g.add(eng);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.62, 14), dark); fan.rotation.y = Math.PI / 2; fan.position.set(3.11, -1.5, s * 4.6); g.add(fan);
    const st = new THREE.Shape(); st.moveTo(0, 0); st.lineTo(-1.6, 3.6); st.lineTo(-2.6, 3.6); st.lineTo(-2.6, 0); st.closePath();
    const hs = new THREE.Mesh(new THREE.ExtrudeGeometry(st, { depth: 0.2, bevelEnabled: false }), white); hs.rotation.x = s * Math.PI / 2; hs.position.set(-10.2, 0.3, 0); g.add(hs);
  }
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-3, 5); fin.lineTo(-4.4, 5); fin.lineTo(-4, 0); fin.closePath();
  const f = new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.25, bevelEnabled: false }), blue); f.position.set(-9, 0.9, -0.12); g.add(f);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  c.scene.add(g);
  return g;
}
