// Visual-only replacement. Uses the game's existing THREE and GFX instances.
// All animation pivots and returned references match the original buildMel().
export function createMelVisual(THREE, GFX, options = {}) {
  const root = new THREE.Group();
  const put = (p, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o; };
  const pivot = put(root, new THREE.Group(), 0, .92, 0);
  const inner = put(pivot, new THREE.Group(), 0, -.92, 0);
  const skin = '#d7ab8c', cream = '#e5d7b8', dark = '#171c22', red = '#b72d2c';
  const material = (c) => new THREE.MeshLambertMaterial({color:c});
  const mats = {};
  const mat = c => mats[c] || (mats[c] = material(c));
  function rounded(w,h,d,c,r=.025) {
    const s = new THREE.Shape(); const x=-w/2+r, y=-h/2+r, W=w-2*r, H=h-2*r;
    s.moveTo(x,y); s.lineTo(x+W,y); s.lineTo(x+W,y+H); s.lineTo(x,y+H); s.closePath();
    const g = new THREE.ExtrudeGeometry(s,{depth:d-2*r,bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:1,steps:1,curveSegments:1});
    g.translate(0,0,-d/2+r);
    return new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
  }
  const box = (w,h,d,c) => new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(c));
  const sphere = (r,c,ws=12,hs=10) => new THREE.Mesh(new THREE.SphereGeometry(r,ws,hs),mat(c));
  function cloth(repeatX,repeatY) {
    const c=document.createElement('canvas'); c.width=c.height=256; const g=c.getContext('2d');
    g.fillStyle=dark; g.fillRect(0,0,256,256);
    g.strokeStyle='#a79879'; g.lineWidth=2.4;
    for(let row=-1;row<5;row++) for(let col=-1;col<5;col++) {
      const x=col*64+(row%2)*32+16,y=row*64+24;
      g.save(); g.translate(x,y); g.rotate(-.36);
      g.beginPath(); g.arc(-6,0,10,.25*Math.PI,1.8*Math.PI); g.stroke();
      g.beginPath(); g.arc(6,0,10,1.25*Math.PI,2.8*Math.PI); g.stroke();
      g.beginPath(); g.moveTo(0,-6);g.lineTo(-5,-6);g.moveTo(0,6);g.lineTo(5,6);g.stroke();
      g.fillStyle='#95866c';g.fillRect(26,24,2,2);g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace=THREE.SRGBColorSpace; else t.encoding=THREE.sRGBEncoding;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeatX,repeatY);t.anisotropy=4;
    return new THREE.MeshLambertMaterial({map:t});
  }
  const bodyMat=cloth(1.6,1.5), limbMat=cloth(1.6,1.5);
  put(inner,rounded(.62,.58,.35,bodyMat),0,1.24,0);
  put(inner,rounded(.63,.085,.355,dark,.012),0,.96,0);
  // Ribbed jacket waistband and zip, not a bag or a strap.
  for(const yy of [.951,.976]) put(inner,box(.63,.011,.359,cream),0,yy,0);
  put(inner,box(.014,.51,.012,'#b8a886'),0,1.24,.191);
  put(inner,box(.035,.057,.019,'#d7c6a0'),0,1.445,.203);
  put(inner,rounded(.19,.14,.20,skin,.02),0,1.57,0);
  const collar=put(inner,rounded(.29,.115,.29,dark,.018),0,1.525,0);
  put(collar,box(.29,.017,.295,cream),0,.035,0);
  for(const side of [-1,1]) {
    const seam=put(inner,box(.115,.014,.015,cream),side*.19,1.08,.19);seam.rotation.z=side*.35;
  }
  function leg(x) {
    const l=put(inner,new THREE.Group(),x,.92,0);
    put(l,rounded(.225,.62,.25,limbMat,.025),0,-.34,0);
    const side=Math.sign(x);
    put(l,box(.009,.59,.086,cream),side*.117,-.34,0);
    put(l,box(.012,.59,.033,red),side*.12,-.34,0);
    put(l,rounded(.224,.10,.255,dark,.008),0,-.61,0);
    for(const yy of [-.585,-.62]) put(l,box(.226,.014,.257,cream),0,yy,0);
    const shoeColor=options.shoeColor || '#fa571d';
    put(l,rounded(.255,.065,.40,'#ece4d1',.015),0,-.715,.066);
    put(l,rounded(.248,.12,.365,shoeColor,.03),0,-.661,.07);
    put(l,rounded(.22,.055,.145,'#fc7b28',.014),0,-.675,.185);
    put(l,box(.15,.052,.15,'#30362b'),0,-.604,.041);
    for(let i=0;i<4;i++) put(l,box(.15,.013,.017,'#deef75'),0,-.574+i*.002,.006+i*.035);
    put(l,box(.026,.049,.08,'#ddec78'),side*.123,-.65,.075);
    return l;
  }
  const legL=leg(-.15),legR=leg(.15);
  function arm(x) {
    const a=put(inner,new THREE.Group(),x,1.46,0);
    put(a,rounded(.175,.50,.20,limbMat,.023),0,-.22,0);
    const side=Math.sign(x);
    put(a,box(.011,.46,.083,cream),side*.091,-.2,0);
    put(a,box(.014,.46,.032,red),side*.096,-.2,0);
    put(a,rounded(.177,.095,.204,cream,.009),0,-.43,0);
    for(const yy of [-.408,-.44]) put(a,box(.18,.013,.207,dark),0,yy,0);
    put(a,rounded(.137,.14,.15,skin,.023),0,-.52,0);
    put(a,sphere(.036,skin),-side*.066,-.505,.04);
    return a;
  }
  const armL=arm(-.39),armR=arm(.39);
  const diary=put(armR,GFX.buildDiaryMesh(),0,-.64,.14);diary.rotation.x=Math.PI/2;diary.visible=false;
  const headG=put(inner,new THREE.Group(),0,1.78,0);
  const skull=put(headG,sphere(1,skin,16,12),0,.005,0);skull.scale.set(.245,.285,.233);
  const jaw=put(headG,sphere(1,skin,12,8),0,-.115,.025);jaw.scale.set(.192,.155,.19);
  // Close-shaved scalp, no original schoolboy hair geometry.
  const scalp=new THREE.Mesh(new THREE.SphereGeometry(1,16,6,0,Math.PI*2,0,Math.PI*.43),mat('#8a7c6d'));
  scalp.scale.set(.247,.286,.235);put(headG,scalp,0,.009,-.003);
  for(const side of [-1,1]) {
    const ear=put(headG,sphere(1,skin,8,6),side*.245,-.02,0);ear.scale.set(.045,.076,.04);
    const inset=put(headG,sphere(1,'#bd8c73',8,6),side*.261,-.022,.025);inset.scale.set(.017,.035,.014);
    const socket=put(headG,sphere(1,'#ba927d'),side*.086,.018,.210);socket.scale.set(.055,.034,.018);
    const eye=put(headG,sphere(1,'#e4dfd2'),side*.086,.02,.226);eye.scale.set(.037,.016,.009);
    const iris=put(headG,sphere(.011,'#57645c',8,6),side*.084,.02,.236);iris.scale.y=.95;
    put(headG,sphere(.0055,'#272b29',8,6),side*.084,.021,.245);
    const brow=put(headG,rounded(.077,.018,.021,'#695b4c',.005),side*.085,.058,.223);brow.rotation.z=side*-.08;
    const cheek=put(headG,sphere(1,skin),side*.12,-.074,.187);cheek.scale.set(.061,.062,.033);
  }
  const nose=put(headG,sphere(1,'#cfa084',8,6),0,-.043,.242);nose.scale.set(.033,.065,.042);
  const nostril=put(headG,sphere(1,'#be8c73',8,6),0,-.083,.258);nostril.scale.set(.042,.019,.022);
  put(headG,rounded(.104,.012,.015,'#916b5a',.004),0,-.149,.204);
  put(headG,rounded(.075,.011,.013,'#c18e77',.004),0,-.163,.202);
  const chin=put(headG,sphere(1,skin),0,-.2,.141);chin.scale.set(.089,.048,.049);
  // A discreet gold chain follows the front of the collar.
  const chainPoints=[];for(let i=0;i<=18;i++){const a=Math.PI*i/18;chainPoints.push(new THREE.Vector3(-.145*Math.cos(a),1.475-.12*Math.sin(a),.195));}
  put(inner,new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPoints),18,.007,4,false),mat('#c2a363')));
  const shadow=GFX.shadowDisc(root,.52,GFX.SHADOW_MAT_CHAR);
  return {root,pivot,inner,legL,legR,armL,armR,headG,shadow,diary};
}
