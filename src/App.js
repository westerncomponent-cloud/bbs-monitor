import { useState, useRef, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie
} from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIG  ← เปลี่ยนค่านี้หลัง Deploy Apps Script
// ─────────────────────────────────────────────────────────────────────────────
const API_URL     = "YOUR_APPS_SCRIPT_WEB_APP_URL"; // ← ใส่ URL จาก Apps Script
const MANAGER_PIN = "1234";                          // ← ต้องตรงกับใน Apps Script

// ─────────────────────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const INSPECTOR_LIST = [
  "เอกวี","พุทธา","สิรินทรา","ประพล","วัชรพงศ์ (โอม)","วัชรพงศ์ (เต่)",
  "นันทพงศ์","จันทนา","อรณา","วิทยา","อมรรัตน","พิกุล","ณัฐชา","ลิ้นทม","อดุลย์"
];
const ZONE_LIST = [
  "PM","Warm Heater","Side Heater","Lid Heater","Heater Set",
  "PRS","Coil SHS","ดัดท่อ/กรอกผง","ขึ้นรูป","STK",
  "QC/QA","ผู้ติดต่อภายนอก","ผู้รับเหมาภายนอก"
];
const MONTH_NAMES = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function nowStr() {
  const d = new Date(), y = d.getFullYear() + 543;
  return `${y}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function passRate(recs) {
  if (!recs.length) return 0;
  return Math.round(recs.filter(r => r.result === "pass").length / recs.length * 100);
}
function scoreColor(r) { return r>=90?"#16a34a":r>=75?"#d97706":"#dc2626"; }
function scoreBg(r)    { return r>=90?"#f0fdf4":r>=75?"#fffbeb":"#fff1f2"; }
function monthLabel(m) {
  const [,mo] = m.split("-");
  return MONTH_NAMES[parseInt(mo)-1];
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED UI
// ─────────────────────────────────────────────────────────────────────────────
function Pill({ pass }) {
  return (
    <span style={{
      display:"inline-flex",alignItems:"center",gap:4,
      background:pass?"#dcfce7":"#fee2e2",color:pass?"#15803d":"#b91c1c",
      borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,
    }}>
      <span style={{width:6,height:6,borderRadius:"50%",background:pass?"#22c55e":"#ef4444",display:"inline-block"}}/>
      {pass?"ไม่พบผิดปกติ":"พบสิ่งผิดปกติ"}
    </span>
  );
}

function CircleScore({ score, size=72 }) {
  const r=size/2-5, circ=2*Math.PI*r, dash=(score/100)*circ, col=scoreColor(score);
  return (
    <svg width={size} height={size} style={{transform:"rotate(-90deg)",flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={7}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        style={{transform:`rotate(90deg)`,transformOrigin:`${size/2}px ${size/2}px`,
          fontSize:size*0.21,fontWeight:800,fill:col,fontFamily:"'Sarabun',sans-serif"}}>
        {score}%
      </text>
    </svg>
  );
}

function Spinner() {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:40,gap:12}}>
      <div style={{width:24,height:24,border:"3px solid #e2e8f0",borderTop:"3px solid #0f4c81",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <span style={{fontSize:14,color:"#64748b",fontFamily:"'Sarabun',sans-serif"}}>กำลังโหลดข้อมูล...</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Toast({ msg, type }) {
  return msg ? (
    <div style={{
      position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",
      background:type==="success"?"#dcfce7":"#fee2e2",
      color:type==="success"?"#15803d":"#b91c1c",
      borderRadius:12,padding:"12px 24px",fontSize:14,fontWeight:700,
      fontFamily:"'Sarabun',sans-serif",boxShadow:"0 4px 20px #0003",
      zIndex:9999,border:`1px solid ${type==="success"?"#86efac":"#fca5a5"}`,
    }}>{type==="success"?"✅":"❌"} {msg}</div>
  ) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  INSPECTOR FORM
// ─────────────────────────────────────────────────────────────────────────────
function InspectorApp() {
  const [step, setStep]           = useState(0);
  const [inspector, setInspector] = useState("");
  const [customName, setCustomName] = useState("");
  const [zone, setZone]           = useState("");
  const [customZone, setCustomZone] = useState("");
  const [result, setResult]       = useState("");
  const [note, setNote]           = useState("");
  const [imgPreview, setImgPreview] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [toast, setToast]         = useState(null);
  const fileRef = useRef();

  const effectiveName = inspector==="อื่นๆ" ? customName.trim() : inspector;
  const effectiveZone = zone==="อื่นๆ" ? customZone.trim() : zone;
  const canNext = effectiveName && effectiveZone && result;

  function showToast(msg, type="success") {
    setToast({msg,type});
    setTimeout(()=>setToast(null), 3000);
  }

  function handleImg(e) {
    const f = e.target.files[0]; if(!f) return;
    const rd = new FileReader();
    rd.onload = ev => setImgPreview(ev.target.result);
    rd.readAsDataURL(f);
  }

  async function doSubmit() {
    setLoading(true);
    try {
      const ts = nowStr();
      const params = new URLSearchParams({
        action:    "write",
        ts:        ts,
        inspector: effectiveName,
        zone:      effectiveZone,
        result:    result,
        note:      note || "",
      });
      const res  = await fetch(`${API_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setStep(2);
      } else {
        showToast("เกิดข้อผิดพลาด: "+data.error, "error");
      }
    } catch (err) {
      showToast("ไม่สามารถส่งข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อ", "error");
    }
    setLoading(false);
  }

  function reset() {
    setStep(0); setInspector(""); setCustomName(""); setZone(""); setCustomZone("");
    setResult(""); setNote(""); setImgPreview(null);
  }

  if (step===2) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:480,gap:20,padding:40}}>
      <div style={{width:90,height:90,borderRadius:"50%",background:"#dcfce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:46}}>✓</div>
      <div style={{fontSize:24,fontWeight:800,color:"#15803d",fontFamily:"'Sarabun',sans-serif"}}>บันทึกสำเร็จ!</div>
      <div style={{fontSize:14,color:"#64748b",textAlign:"center",fontFamily:"'Sarabun',sans-serif",lineHeight:1.8}}>
        ข้อมูลถูกบันทึกเข้า Google Sheets แล้ว<br/>ขอบคุณที่ช่วยดูแลความปลอดภัย 🙏
      </div>
      <button onClick={reset} style={{background:"linear-gradient(135deg,#0f2942,#0f4c81)",color:"#fff",border:"none",borderRadius:14,padding:"14px 40px",fontSize:16,fontWeight:800,cursor:"pointer",fontFamily:"'Sarabun',sans-serif",boxShadow:"0 4px 16px #0f4c8133",marginTop:8}}>ตรวจครั้งใหม่ →</button>
    </div>
  );

  if (step===1) return (
    <div style={{padding:"4px 0 24px"}}>
      <Toast msg={toast?.msg} type={toast?.type}/>
      <div style={{background:"#f8fafc",borderRadius:14,padding:20,margin:"0 0 16px",display:"flex",flexDirection:"column",gap:12}}>
        <div style={{fontSize:15,fontWeight:800,color:"#0f2942",fontFamily:"'Sarabun',sans-serif"}}>ยืนยันข้อมูลการตรวจ</div>
        {[["👤 ผู้ตรวจ",effectiveName],["📍 พื้นที่",effectiveZone],["🕐 เวลา",nowStr()]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",gap:12,fontSize:14,fontFamily:"'Sarabun',sans-serif"}}>
            <span style={{color:"#94a3b8",flexShrink:0}}>{k}</span>
            <span style={{fontWeight:700,color:"#1e293b",textAlign:"right"}}>{v}</span>
          </div>
        ))}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:14,fontFamily:"'Sarabun',sans-serif"}}>
          <span style={{color:"#94a3b8"}}>🔍 ผล</span>
          <Pill pass={result==="pass"}/>
        </div>
        {note && <div style={{fontSize:13,color:"#92400e",fontFamily:"'Sarabun',sans-serif",background:"#fef3c7",borderRadius:8,padding:"8px 12px"}}>📝 {note}</div>}
        {imgPreview && <img src={imgPreview} alt="หลักฐาน" style={{width:"100%",borderRadius:10,maxHeight:180,objectFit:"cover"}}/>}
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={()=>setStep(0)} style={{flex:1,background:"#f1f5f9",color:"#475569",border:"none",borderRadius:14,padding:14,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Sarabun',sans-serif"}}>← แก้ไข</button>
        <button onClick={doSubmit} disabled={loading} style={{flex:2,background:"linear-gradient(135deg,#0f2942,#0f4c81)",color:"#fff",border:"none",borderRadius:14,padding:14,fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Sarabun',sans-serif",opacity:loading?0.7:1}}>
          {loading ? "⏳ กำลังส่ง..." : "✓ ยืนยันส่งข้อมูล → Sheets"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20,paddingBottom:24}}>
      {/* Inspector select */}
      <div>
        <label style={{fontSize:13,fontWeight:700,color:"#334155",fontFamily:"'Sarabun',sans-serif",display:"block",marginBottom:8}}>👤 ชื่อผู้ตรวจ BBS <span style={{color:"#ef4444"}}>*</span></label>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:7,marginBottom:inspector==="อื่นๆ"?10:0}}>
          {[...INSPECTOR_LIST,"อื่นๆ"].map(n=>(
            <button key={n} onClick={()=>setInspector(n)} style={{
              padding:"10px 8px",borderRadius:10,fontSize:13,fontWeight:600,
              border:`2px solid ${inspector===n?(n==="อื่นๆ"?"#7c3aed":"#0f4c81"):"#e2e8f0"}`,
              background:inspector===n?(n==="อื่นๆ"?"#f5f3ff":"#eff6ff"):"#fff",
              color:inspector===n?(n==="อื่นๆ"?"#7c3aed":"#0f4c81"):"#64748b",
              cursor:"pointer",fontFamily:"'Sarabun',sans-serif",transition:"all 0.15s",
              ...(n==="อื่นๆ"?{gridColumn:"1/-1"}:{}),
            }}>
              {n==="อื่นๆ"?"✏️ อื่นๆ (พิมพ์ชื่อ)":n}
            </button>
          ))}
        </div>
        {inspector==="อื่นๆ" && (
          <input value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="พิมพ์ชื่อผู้ตรวจ..."
            style={{width:"100%",padding:"13px 14px",borderRadius:12,fontSize:15,border:"2px solid #a78bfa",background:"#faf5ff",fontFamily:"'Sarabun',sans-serif",boxSizing:"border-box",color:"#1e293b",outline:"none"}}/>
        )}
      </div>

      {/* Zone select */}
      <div>
        <label style={{fontSize:13,fontWeight:700,color:"#334155",fontFamily:"'Sarabun',sans-serif",display:"block",marginBottom:8}}>📍 พื้นที่ที่ตรวจ <span style={{color:"#ef4444"}}>*</span></label>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:zone==="อื่นๆ"?10:0}}>
          {[...ZONE_LIST,"อื่นๆ"].map(z=>(
            <button key={z} onClick={()=>setZone(z)} style={{
              padding:"10px 8px",borderRadius:10,fontSize:12,fontWeight:600,
              border:`2px solid ${zone===z?(z==="อื่นๆ"?"#7c3aed":"#0f4c81"):"#e2e8f0"}`,
              background:zone===z?(z==="อื่นๆ"?"#f5f3ff":"#eff6ff"):"#fff",
              color:zone===z?(z==="อื่นๆ"?"#7c3aed":"#0f4c81"):"#64748b",
              cursor:"pointer",fontFamily:"'Sarabun',sans-serif",transition:"all 0.15s",
              ...(z==="อื่นๆ"?{gridColumn:"1/-1"}:{}),
            }}>
              {z==="อื่นๆ"?"✏️ อื่นๆ (พิมพ์พื้นที่)":z}
            </button>
          ))}
        </div>
        {zone==="อื่นๆ" && (
          <input value={customZone} onChange={e=>setCustomZone(e.target.value)} placeholder="พิมพ์ชื่อพื้นที่..."
            style={{width:"100%",padding:"13px 14px",borderRadius:12,fontSize:15,border:"2px solid #a78bfa",background:"#faf5ff",fontFamily:"'Sarabun',sans-serif",boxSizing:"border-box",color:"#1e293b",outline:"none"}}/>
        )}
      </div>

      {/* Result */}
      <div>
        <label style={{fontSize:13,fontWeight:700,color:"#334155",fontFamily:"'Sarabun',sans-serif",display:"block",marginBottom:8}}>🔍 ผลการตรวจ <span style={{color:"#ef4444"}}>*</span></label>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {[
            {val:"pass",emoji:"✅",label:"ไม่พบสิ่งผิดปกติ",ac:"#22c55e",bg:"#dcfce7",tc:"#15803d"},
            {val:"fail",emoji:"⚠️",label:"พบสิ่งผิดปกติ",ac:"#ef4444",bg:"#fee2e2",tc:"#b91c1c"},
          ].map(o=>(
            <button key={o.val} onClick={()=>setResult(o.val)} style={{
              padding:"18px 10px",borderRadius:14,fontSize:14,fontWeight:800,
              border:`2.5px solid ${result===o.val?o.ac:"#e2e8f0"}`,
              background:result===o.val?o.bg:"#fff",
              color:result===o.val?o.tc:"#94a3b8",
              cursor:"pointer",fontFamily:"'Sarabun',sans-serif",transition:"all 0.15s",
            }}>
              <div style={{fontSize:30,marginBottom:6}}>{o.emoji}</div>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Note */}
      {result==="fail" && (
        <div>
          <label style={{fontSize:13,fontWeight:700,color:"#b91c1c",fontFamily:"'Sarabun',sans-serif",display:"block",marginBottom:8}}>📝 ลักษณะสิ่งผิดปกติที่พบ</label>
          <textarea value={note} onChange={e=>setNote(e.target.value)}
            placeholder="เช่น ไม่สวมหมวกนิรภัย, ไม่สวมถุงมือ..." rows={3}
            style={{width:"100%",padding:"12px 14px",borderRadius:12,fontSize:14,border:"1.5px solid #fca5a5",background:"#fff",fontFamily:"'Sarabun',sans-serif",resize:"none",boxSizing:"border-box",color:"#1e293b",outline:"none"}}/>
        </div>
      )}

      {/* Photo */}
      <div>
        <label style={{fontSize:13,fontWeight:700,color:"#334155",fontFamily:"'Sarabun',sans-serif",display:"block",marginBottom:8}}>📷 ถ่ายรูปหลักฐาน</label>
        <input type="file" accept="image/*" capture="environment" ref={fileRef} onChange={handleImg} style={{display:"none"}}/>
        {imgPreview ? (
          <div style={{position:"relative"}}>
            <img src={imgPreview} alt="preview" style={{width:"100%",borderRadius:12,maxHeight:200,objectFit:"cover"}}/>
            <button onClick={()=>{setImgPreview(null);fileRef.current.value="";}} style={{position:"absolute",top:8,right:8,background:"#000a",color:"#fff",border:"none",borderRadius:"50%",width:28,height:28,cursor:"pointer",fontSize:15}}>✕</button>
          </div>
        ):(
          <button onClick={()=>fileRef.current.click()} style={{width:"100%",padding:18,borderRadius:12,fontSize:14,border:"2px dashed #cbd5e1",background:"#f8fafc",color:"#64748b",cursor:"pointer",fontFamily:"'Sarabun',sans-serif",fontWeight:600}}>
            📸 แตะเพื่อเปิดกล้อง / เลือกรูป
          </button>
        )}
      </div>

      <button onClick={()=>setStep(1)} disabled={!canNext} style={{
        width:"100%",padding:16,borderRadius:14,fontSize:16,fontWeight:800,border:"none",
        cursor:canNext?"pointer":"not-allowed",
        background:canNext?"linear-gradient(135deg,#0f2942,#0f4c81)":"#e2e8f0",
        color:canNext?"#fff":"#94a3b8",fontFamily:"'Sarabun',sans-serif",
        boxShadow:canNext?"0 4px 16px #0f4c8133":"none",transition:"all 0.2s",
      }}>ตรวจสอบข้อมูลก่อนส่ง →</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MANAGER DASHBOARD (pulls from Sheets API)
// ─────────────────────────────────────────────────────────────────────────────
function ManagerDashboard({ pin, onLogout }) {
  const [records, setRecords]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [dashTab, setDashTab]         = useState("overview");
  const [filterMonth, setFilterMonth] = useState("ทั้งหมด");
  const [selInspector, setSelInspector] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const url = `${API_URL}?pin=${pin}`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.ok) {
        setRecords(data.data);
        setLastRefresh(new Date().toLocaleTimeString("th-TH"));
      } else {
        setError(data.error || "ไม่สามารถโหลดข้อมูลได้");
      }
    } catch(e) {
      setError("เชื่อมต่อ API ไม่ได้ — กรุณาตรวจสอบ URL ใน config");
    }
    setLoading(false);
  }, [pin]);

  useEffect(()=>{ fetchData(); }, [fetchData]);

  const allMonths      = [...new Set(records.map(r=>String(r.month)))].sort();
  const filteredByMonth = filterMonth==="ทั้งหมด" ? records : records.filter(r=>String(r.month)===filterMonth);
  const totalPass      = filteredByMonth.filter(r=>r.result==="pass").length;
  const totalFail      = filteredByMonth.filter(r=>r.result==="fail").length;
  const overallRate    = passRate(filteredByMonth);

  const zoneStats = ZONE_LIST.map(z=>({
    name:z.length>9?z.slice(0,9)+"…":z,
    pass:filteredByMonth.filter(r=>r.zone===z&&r.result==="pass").length,
    fail:filteredByMonth.filter(r=>r.zone===z&&r.result==="fail").length,
  })).filter(z=>z.pass+z.fail>0);

  const monthlyTrend = allMonths.map(m=>({
    name:monthLabel(m),
    pass:records.filter(r=>String(r.month)===m&&r.result==="pass").length,
    fail:records.filter(r=>String(r.month)===m&&r.result==="fail").length,
    rate:passRate(records.filter(r=>String(r.month)===m)),
  }));

  const inspectorStats = INSPECTOR_LIST.map(ins=>{
    const recs = filteredByMonth.filter(r=>r.inspector===ins);
    const rate = passRate(recs);
    return { name:ins, total:recs.length, pass:recs.filter(r=>r.result==="pass").length, fail:recs.filter(r=>r.result==="fail").length, rate,
      failNotes: recs.filter(r=>r.result==="fail").map(r=>r.note).filter(Boolean) };
  }).filter(s=>s.total>0).sort((a,b)=>b.rate-a.rate);

  const pieData = [
    {name:"ไม่พบผิดปกติ",value:totalPass,fill:"#22c55e"},
    {name:"พบสิ่งผิดปกติ",value:totalFail,fill:"#ef4444"},
  ];

  const tab = k => ({
    padding:"8px 16px",border:"none",cursor:"pointer",fontWeight:dashTab===k?800:600,
    fontSize:13,fontFamily:"'Sarabun',sans-serif",
    background:dashTab===k?"#0f4c81":"transparent",
    color:dashTab===k?"#fff":"#64748b",borderRadius:8,transition:"all 0.18s",
  });

  if (loading) return <Spinner/>;
  if (error) return (
    <div style={{padding:32,textAlign:"center"}}>
      <div style={{fontSize:32,marginBottom:12}}>⚠️</div>
      <div style={{fontSize:14,color:"#b91c1c",fontFamily:"'Sarabun',sans-serif",marginBottom:16}}>{error}</div>
      <button onClick={fetchData} style={{background:"#0f4c81",color:"#fff",border:"none",borderRadius:10,padding:"10px 24px",fontSize:14,cursor:"pointer",fontFamily:"'Sarabun',sans-serif"}}>ลองใหม่</button>
    </div>
  );

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{display:"flex",gap:4,marginBottom:18,background:"#f1f5f9",borderRadius:10,padding:4,flexWrap:"wrap"}}>
        {[{key:"overview",label:"📊 ภาพรวม"},{key:"monthly",label:"📅 รายเดือน"},{key:"person",label:"👤 รายบุคคล"},{key:"log",label:"📋 บันทึก"}].map(t=>(
          <button key={t.key} onClick={()=>{setDashTab(t.key);setSelInspector(null);}} style={tab(t.key)}>{t.label}</button>
        ))}
        <button onClick={fetchData} style={{...tab("refresh"),marginLeft:"auto",background:"#f0fdf4",color:"#15803d"}}>🔄 รีเฟรช</button>
        <button onClick={onLogout} style={{...tab("out"),background:"transparent",color:"#94a3b8"}}>ออก</button>
      </div>
      {lastRefresh && <div style={{fontSize:11,color:"#94a3b8",fontFamily:"'Sarabun',sans-serif",marginBottom:12}}>อัปเดตล่าสุด: {lastRefresh} · {records.length} รายการรวม</div>}

      {/* Month filter */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:"#64748b",fontFamily:"'Sarabun',sans-serif"}}>ช่วงเวลา:</span>
        {["ทั้งหมด",...allMonths].map(m=>(
          <button key={m} onClick={()=>setFilterMonth(m)} style={{
            padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600,border:"none",cursor:"pointer",
            background:filterMonth===m?"#0f4c81":"#e2e8f0",
            color:filterMonth===m?"#fff":"#475569",fontFamily:"'Sarabun',sans-serif",transition:"all 0.15s",
          }}>{m==="ทั้งหมด"?"ทั้งหมด":monthLabel(m)+" "+m.split("-")[0]}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {dashTab==="overview" && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            {[
              {label:"ครั้งที่ตรวจ",value:filteredByMonth.length,unit:"ครั้ง",color:"#0f4c81",bg:"#eff6ff"},
              {label:"ผ่านเกณฑ์",value:`${overallRate}%`,unit:"",color:scoreColor(overallRate),bg:scoreBg(overallRate)},
              {label:"พบปัญหา",value:totalFail,unit:"ครั้ง",color:"#dc2626",bg:"#fff1f2"},
              {label:"ผู้ตรวจ",value:inspectorStats.length,unit:"คน",color:"#7c3aed",bg:"#f5f3ff"},
            ].map(c=>(
              <div key={c.label} style={{background:c.bg,borderRadius:12,padding:"14px 10px",textAlign:"center"}}>
                <div style={{fontSize:24,fontWeight:800,color:c.color,fontFamily:"'Sarabun',sans-serif"}}>{c.value}<span style={{fontSize:12}}> {c.unit}</span></div>
                <div style={{fontSize:11,color:"#64748b",fontFamily:"'Sarabun',sans-serif",marginTop:2}}>{c.label}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 200px",gap:12}}>
            <div style={{background:"#fff",borderRadius:14,padding:"16px 14px",border:"1px solid #f1f5f9"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:12,fontFamily:"'Sarabun',sans-serif"}}>🏭 สถิติตามพื้นที่</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={zoneStats} barSize={16}>
                  <XAxis dataKey="name" tick={{fontSize:9,fontFamily:"'Sarabun',sans-serif"}}/>
                  <YAxis hide/><Tooltip wrapperStyle={{fontFamily:"'Sarabun',sans-serif",fontSize:12}}/>
                  <Bar dataKey="pass" name="ปกติ" stackId="a" fill="#86efac" radius={[0,0,4,4]}/>
                  <Bar dataKey="fail" name="พบปัญหา" stackId="a" fill="#fca5a5" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:"#fff",borderRadius:14,padding:"16px 14px",border:"1px solid #f1f5f9",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
              <div style={{fontSize:13,fontWeight:700,color:"#334155",fontFamily:"'Sarabun',sans-serif",alignSelf:"flex-start"}}>🥧 ภาพรวม</div>
              <PieChart width={170} height={130}>
                <Pie data={pieData} cx={85} cy={60} innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value">
                  {pieData.map((e,i)=><Cell key={i} fill={e.fill}/>)}
                </Pie>
                <Tooltip wrapperStyle={{fontFamily:"'Sarabun',sans-serif",fontSize:11}}/>
              </PieChart>
              {pieData.map(p=>(
                <div key={p.name} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,fontFamily:"'Sarabun',sans-serif",color:"#64748b"}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:p.fill,display:"inline-block"}}/>{p.name}: {p.value}
                </div>
              ))}
            </div>
          </div>
          {/* Ranking */}
          <div style={{background:"#fff",borderRadius:14,padding:"16px 14px",border:"1px solid #f1f5f9"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:12,fontFamily:"'Sarabun',sans-serif"}}>🏆 Ranking ผู้ตรวจ (คลิกเพื่อดูรายละเอียด)</div>
            {inspectorStats.map((s,i)=>(
              <div key={s.name} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,cursor:"pointer",padding:"6px 8px",borderRadius:8,background:selInspector===s.name?"#eff6ff":"transparent"}}
                onClick={()=>{setSelInspector(s.name);setDashTab("person");}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:i<3?["#fbbf24","#94a3b8","#d97706"][i]:"#f1f5f9",color:i<3?"#fff":"#64748b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0}}>{i+1}</div>
                <div style={{fontSize:13,fontFamily:"'Sarabun',sans-serif",flex:1,fontWeight:600,color:"#1e293b"}}>{s.name}</div>
                <div style={{width:100,height:7,borderRadius:4,background:"#f1f5f9",overflow:"hidden",flexShrink:0}}>
                  <div style={{width:`${s.rate}%`,height:"100%",background:scoreColor(s.rate),borderRadius:4}}/>
                </div>
                <div style={{fontSize:13,fontWeight:800,color:scoreColor(s.rate),width:38,textAlign:"right",flexShrink:0}}>{s.rate}%</div>
                <div style={{fontSize:11,color:"#94a3b8",fontFamily:"'Sarabun',sans-serif",width:44,textAlign:"right"}}>{s.total} ครั้ง</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MONTHLY ── */}
      {dashTab==="monthly" && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:"#fff",borderRadius:14,padding:"16px 14px",border:"1px solid #f1f5f9"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:12,fontFamily:"'Sarabun',sans-serif"}}>📈 อัตราผ่านรายเดือน (%)</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={monthlyTrend}>
                <XAxis dataKey="name" tick={{fontSize:11,fontFamily:"'Sarabun',sans-serif"}}/><YAxis domain={[0,100]} tick={{fontSize:10}}/>
                <Tooltip formatter={v=>`${v}%`} wrapperStyle={{fontFamily:"'Sarabun',sans-serif",fontSize:12}}/>
                <Line type="monotone" dataKey="rate" name="อัตราผ่าน" stroke="#0f4c81" strokeWidth={3} dot={{r:5,fill:"#0f4c81"}}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:"#fff",borderRadius:14,padding:"16px 14px",border:"1px solid #f1f5f9"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:12,fontFamily:"'Sarabun',sans-serif"}}>📊 จำนวนครั้งตรวจรายเดือน</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={monthlyTrend} barSize={40}>
                <XAxis dataKey="name" tick={{fontSize:11,fontFamily:"'Sarabun',sans-serif"}}/><YAxis hide/>
                <Tooltip wrapperStyle={{fontFamily:"'Sarabun',sans-serif",fontSize:12}}/>
                <Bar dataKey="pass" name="ปกติ" stackId="a" fill="#86efac" radius={[0,0,6,6]}/>
                <Bar dataKey="fail" name="พบปัญหา" stackId="a" fill="#fca5a5" radius={[6,6,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:"#fff",borderRadius:14,padding:"16px 14px",border:"1px solid #f1f5f9"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:12,fontFamily:"'Sarabun',sans-serif"}}>📋 ตารางสรุปรายเดือน</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{background:"#f8fafc"}}>
                {["เดือน","รวม","ผ่าน","พบปัญหา","อัตราผ่าน"].map(h=>(
                  <th key={h} style={{padding:"9px 12px",textAlign:h==="เดือน"?"left":"center",fontSize:12,color:"#64748b",fontFamily:"'Sarabun',sans-serif",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{monthlyTrend.map((m,i)=>(
                <tr key={m.name} style={{borderBottom:"1px solid #f8fafc",background:i%2===0?"#fff":"#fafafa"}}>
                  <td style={{padding:"9px 12px",fontWeight:700,color:"#1e293b",fontFamily:"'Sarabun',sans-serif"}}>{m.name}</td>
                  <td style={{padding:"9px 12px",textAlign:"center",color:"#334155",fontFamily:"'Sarabun',sans-serif"}}>{m.pass+m.fail}</td>
                  <td style={{padding:"9px 12px",textAlign:"center",color:"#15803d",fontWeight:700,fontFamily:"'Sarabun',sans-serif"}}>{m.pass}</td>
                  <td style={{padding:"9px 12px",textAlign:"center",color:"#dc2626",fontWeight:700,fontFamily:"'Sarabun',sans-serif"}}>{m.fail}</td>
                  <td style={{padding:"9px 12px",textAlign:"center"}}>
                    <span style={{background:scoreBg(m.rate),color:scoreColor(m.rate),borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:800,fontFamily:"'Sarabun',sans-serif"}}>{m.rate}%</span>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PERSON ── */}
      {dashTab==="person" && (
        <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
          <div style={{flex:"1 1 280px",display:"flex",flexDirection:"column",gap:8}}>
            {inspectorStats.map((s,i)=>(
              <div key={s.name} onClick={()=>setSelInspector(selInspector===s.name?null:s.name)} style={{
                background:"#fff",borderRadius:14,padding:"14px 16px",
                border:`2px solid ${selInspector===s.name?"#0f4c81":"#f1f5f9"}`,
                cursor:"pointer",transition:"all 0.15s",
                boxShadow:selInspector===s.name?"0 4px 16px #0f4c8122":"0 1px 4px #0001",
                display:"flex",alignItems:"center",gap:12,
              }}>
                <div style={{width:26,height:26,borderRadius:"50%",background:i<3?["#fbbf24","#94a3b8","#d97706"][i]:"#f1f5f9",color:i<3?"#fff":"#64748b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0}}>{i+1}</div>
                <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,#0f4c81,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:15,fontFamily:"'Sarabun',sans-serif",flexShrink:0}}>{s.name.slice(0,2)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#0f2942",fontFamily:"'Sarabun',sans-serif"}}>{s.name}</div>
                  <div style={{fontSize:11,color:"#94a3b8",fontFamily:"'Sarabun',sans-serif"}}>{s.total} ครั้ง · พบปัญหา {s.fail} ครั้ง</div>
                </div>
                <CircleScore score={s.rate} size={52}/>
              </div>
            ))}
          </div>
          {selInspector && (()=>{
            const s = inspectorStats.find(x=>x.name===selInspector);
            const detail = filteredByMonth.filter(r=>r.inspector===selInspector);
            const mBreak = allMonths.map(m=>({
              name:monthLabel(m),
              rate:passRate(records.filter(r=>r.inspector===selInspector&&String(r.month)===m)),
            }));
            return (
              <div style={{flex:"1 1 280px",background:"#fff",borderRadius:16,padding:"18px 16px",border:"1.5px solid #bfdbfe",alignSelf:"flex-start",position:"sticky",top:20}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                  <div style={{display:"flex",gap:12,alignItems:"center"}}>
                    <div style={{width:50,height:50,borderRadius:"50%",background:"linear-gradient(135deg,#0f4c81,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:17,fontFamily:"'Sarabun',sans-serif"}}>{s.name.slice(0,2)}</div>
                    <div>
                      <div style={{fontSize:16,fontWeight:800,color:"#0f2942",fontFamily:"'Sarabun',sans-serif"}}>{s.name}</div>
                      <div style={{fontSize:11,color:"#64748b",fontFamily:"'Sarabun',sans-serif"}}>{s.total} ครั้ง รวม</div>
                      <span style={{background:scoreBg(s.rate),color:scoreColor(s.rate),borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:800,fontFamily:"'Sarabun',sans-serif"}}>
                        {s.rate>=90?"✅ ผ่านเกณฑ์":s.rate>=75?"⚠️ ต้องปรับปรุง":"❌ ต่ำกว่าเกณฑ์"}
                      </span>
                    </div>
                  </div>
                  <CircleScore score={s.rate} size={70}/>
                </div>
                <div style={{fontSize:12,fontWeight:700,color:"#475569",marginBottom:8,fontFamily:"'Sarabun',sans-serif"}}>📈 อัตราผ่านรายเดือน</div>
                <ResponsiveContainer width="100%" height={90}>
                  <LineChart data={mBreak}>
                    <XAxis dataKey="name" tick={{fontSize:9,fontFamily:"'Sarabun',sans-serif"}}/><YAxis hide domain={[0,100]}/>
                    <Tooltip formatter={v=>`${v}%`} wrapperStyle={{fontFamily:"'Sarabun',sans-serif",fontSize:11}}/>
                    <Line type="monotone" dataKey="rate" stroke="#0f4c81" strokeWidth={2.5} dot={{r:4,fill:"#0f4c81"}}/>
                  </LineChart>
                </ResponsiveContainer>
                {s.failNotes.length>0 && (
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#b91c1c",marginBottom:6,fontFamily:"'Sarabun',sans-serif"}}>⚠️ ประเด็นที่พบบ่อย</div>
                    {[...new Set(s.failNotes)].map(n=>(
                      <div key={n} style={{fontSize:11,color:"#92400e",background:"#fef3c7",borderRadius:6,padding:"5px 10px",marginBottom:4,fontFamily:"'Sarabun',sans-serif"}}>• {n}</div>
                    ))}
                  </div>
                )}
                <div style={{marginTop:12}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#475569",marginBottom:8,fontFamily:"'Sarabun',sans-serif"}}>📋 ประวัติล่าสุด</div>
                  <div style={{maxHeight:200,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
                    {detail.slice(0,15).map(r=>(
                      <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"#f8fafc",borderRadius:8}}>
                        <span style={{fontSize:10,color:"#94a3b8",fontFamily:"'Sarabun',sans-serif",flexShrink:0}}>{String(r.ts).slice(5,10)}</span>
                        <span style={{fontSize:12,color:"#475569",fontFamily:"'Sarabun',sans-serif",flex:1}}>{r.zone}</span>
                        <Pill pass={r.result==="pass"}/>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── LOG ── */}
      {dashTab==="log" && (
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #f1f5f9",overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #f1f5f9",fontSize:13,fontWeight:700,color:"#334155",fontFamily:"'Sarabun',sans-serif"}}>📋 บันทึกทั้งหมด ({filteredByMonth.length} รายการ)</div>
          <div style={{maxHeight:500,overflowY:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{background:"#f8fafc",position:"sticky",top:0}}>
                {["วันที่","ผู้ตรวจ","พื้นที่","ผล","หมายเหตุ"].map(h=>(
                  <th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:11,color:"#64748b",fontFamily:"'Sarabun',sans-serif",borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{filteredByMonth.map((r,i)=>(
                <tr key={r.id||i} style={{borderBottom:"1px solid #f8fafc",background:i%2===0?"#fff":"#fafafa"}}>
                  <td style={{padding:"8px 12px",fontSize:12,fontFamily:"'Sarabun',sans-serif",color:"#334155",whiteSpace:"nowrap"}}>{r.ts}</td>
                  <td style={{padding:"8px 12px",fontSize:12,fontFamily:"'Sarabun',sans-serif",color:"#1e293b",fontWeight:600}}>{r.inspector}</td>
                  <td style={{padding:"8px 12px",fontSize:12,fontFamily:"'Sarabun',sans-serif",color:"#475569"}}>{r.zone}</td>
                  <td style={{padding:"8px 12px"}}><Pill pass={r.result==="pass"}/></td>
                  <td style={{padding:"8px 12px",fontSize:11,fontFamily:"'Sarabun',sans-serif",color:"#94a3b8"}}>{r.note||"-"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MANAGER LOGIN
// ─────────────────────────────────────────────────────────────────────────────
function ManagerLogin({ onLogin }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  function tryLogin() {
    if (pin === MANAGER_PIN) { onLogin(pin); }
    else { setErr(true); setPin(""); setTimeout(()=>setErr(false),1500); }
  }
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:460,gap:20,padding:36}}>
      <div style={{fontSize:48,marginBottom:4}}>🔐</div>
      <div style={{fontSize:21,fontWeight:800,color:"#0f2942",fontFamily:"'Sarabun',sans-serif"}}>เข้าสู่ระบบผู้จัดการ</div>
      <div style={{fontSize:13,color:"#94a3b8",fontFamily:"'Sarabun',sans-serif",textAlign:"center",lineHeight:1.7}}>
        Dashboard นี้สำหรับผู้จัดการเท่านั้น<br/>ข้อมูลดึงจาก Google Sheets แบบ real-time
      </div>
      <input type="password" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tryLogin()}
        placeholder="กรอก PIN" maxLength={6}
        style={{width:180,padding:"14px 18px",borderRadius:12,fontSize:22,letterSpacing:8,textAlign:"center",
          border:`2px solid ${err?"#ef4444":"#e2e8f0"}`,background:err?"#fff1f2":"#f8fafc",
          fontFamily:"'Sarabun',sans-serif",outline:"none",boxShadow:err?"0 0 0 3px #fca5a544":"none",transition:"all 0.2s"}}/>
      {err && <div style={{fontSize:13,color:"#ef4444",fontFamily:"'Sarabun',sans-serif"}}>PIN ไม่ถูกต้อง</div>}
      <button onClick={tryLogin} style={{background:"linear-gradient(135deg,#0f2942,#0f4c81)",color:"#fff",border:"none",
        borderRadius:14,padding:"13px 44px",fontSize:15,fontWeight:800,cursor:"pointer",
        fontFamily:"'Sarabun',sans-serif",boxShadow:"0 4px 14px #0f4c8133"}}>เข้าสู่ระบบ</button>
      <div style={{fontSize:11,color:"#cbd5e1",fontFamily:"'Sarabun',sans-serif"}}>(PIN ตั้งใน Apps Script)</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [appMode, setAppMode]   = useState("inspector");
  const [managerPin, setManagerPin] = useState(null);

  return (
    <div style={{maxWidth:1000,margin:"0 auto",fontFamily:"'Sarabun',sans-serif",background:"#f0f4f8",minHeight:"100vh"}}>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet"/>
      <div style={{background:"linear-gradient(135deg,#0f2942 0%,#0f4c81 100%)",padding:"16px 20px 0",boxShadow:"0 4px 20px #0004"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:38,height:38,borderRadius:10,background:"#ffffff20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🏭</div>
            <div>
              <div style={{fontWeight:800,fontSize:17,color:"#fff"}}>BBS Safety Monitor</div>
              <div style={{fontSize:11,color:"#93c5fd"}}>ข้อมูลเชื่อมต่อ Google Sheets · Real-time</div>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:2}}>
          {[{key:"inspector",label:"📝 กรอกตรวจ"},{key:"manager",label:"🔐 ผู้จัดการ"}].map(m=>(
            <button key={m.key} onClick={()=>setAppMode(m.key)} style={{
              padding:"10px 22px",border:"none",cursor:"pointer",
              background:appMode===m.key?"#fff":"transparent",
              color:appMode===m.key?"#0f4c81":"#93c5fd",
              fontWeight:appMode===m.key?800:600,
              fontSize:14,fontFamily:"'Sarabun',sans-serif",
              borderRadius:"10px 10px 0 0",transition:"all 0.2s",
            }}>{m.label}</button>
          ))}
        </div>
      </div>
      <div style={{padding:16}}>
        {appMode==="inspector" && (
          <div style={{maxWidth:460,margin:"0 auto"}}>
            <div style={{background:"#fff",borderRadius:16,padding:"20px 18px",boxShadow:"0 2px 12px #0001"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,paddingBottom:14,borderBottom:"1px solid #f1f5f9"}}>
                <div>
                  <div style={{fontWeight:800,fontSize:18,color:"#0f2942"}}>บันทึกการสุ่มตรวจ</div>
                  <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>ข้อมูลจะถูกบันทึกเข้า Google Sheets ทันที</div>
                </div>
                <div style={{fontSize:11,color:"#94a3b8",background:"#f8fafc",borderRadius:8,padding:"4px 10px"}}>{nowStr()}</div>
              </div>
              <InspectorApp/>
            </div>
          </div>
        )}
        {appMode==="manager" && (
          <div style={{background:"#fff",borderRadius:16,padding:"20px 18px",boxShadow:"0 2px 12px #0001"}}>
            {!managerPin
              ? <ManagerLogin onLogin={setManagerPin}/>
              : <>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,paddingBottom:14,borderBottom:"1px solid #f1f5f9"}}>
                    <div>
                      <div style={{fontWeight:800,fontSize:18,color:"#0f2942"}}>📊 Dashboard ผู้จัดการ</div>
                      <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>ดึงข้อมูลจาก Google Sheets แบบ real-time</div>
                    </div>
                  </div>
                  <ManagerDashboard pin={managerPin} onLogout={()=>setManagerPin(null)}/>
                </>
            }
          </div>
        )}
      </div>
    </div>
  );
}
