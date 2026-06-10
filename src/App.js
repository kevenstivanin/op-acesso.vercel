import { useState, useMemo, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";

async function criptografarDoc(doc) {
  const res = await fetch("/api/encrypt", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpf: doc }),
  });
  if (!res.ok) throw new Error("Erro ao processar documento");
  const { encrypted } = await res.json();
  return encrypted;
}

async function descriptografarDoc(encrypted, adminPin) {
  const res = await fetch("/api/decrypt", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encrypted, adminPin }),
  });
  if (!res.ok) { const { error } = await res.json(); throw new Error(error || "Erro"); }
  const { cpf } = await res.json();
  return cpf;
}

async function verificarPin(pin, tipo = "app") {
  const res = await fetch("/api/verify-pin", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, tipo }),
  });
  return res.ok;
}

async function registrarLog(adminPin, lider, totalRegistros) {
  await fetch("/api/log-export", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminPin, lider, totalRegistros }),
  });
}

function mascararDoc(doc) {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return "***." + d.slice(3,6) + "." + d.slice(6,9) + "-**";
  if (doc.length > 4) return doc.slice(0,2) + "***" + doc.slice(-2).toUpperCase();
  return "****";
}

const G = {
  azul:"#0055A5", azulEscuro:"#003D7A", azulMedio:"#1A6BBF",
  preto:"#0D0D0D", branco:"#FFFFFF", cinzaClaro:"#F0F4F9",
  cinzaBorda:"#C8D8EC", cinzaTexto:"#5A7A9A", dourado:"#C9A84C",
};

const MOTIVOS_LIBERACAO = [
  "Criança","Idoso(a)","Sócio inadimplente","Transferência","Setor incorreto",
  "Acesso já utilizado","Responsável já acessou","Catraca com defeito","Outros"
];

const SETORES_PORTOES = [
  { setor:"Gramado Leste (K,M,O)", portoes:["Portão K","Portão M","Portão O"] },
  { setor:"Gramado Oeste (B,D,Y)", portoes:["Portão B","Portão D","Portão Y"] },
  { setor:"Gramado Sul (F,H)", portoes:["Portão F","Portão H"] },
  { setor:"Superior Leste (L,P)", portoes:["Portão L","Portão P"] },
  { setor:"Superior Sul (E)", portoes:["Portão E"] },
  { setor:"Arquibancada Norte (Q,S,U,W)", portoes:["Portão Q","Portão S","Portão U","Portão W"] },
  { setor:"Superior Oeste (C,X)", portoes:["Portão C","Portão X"] },
  { setor:"Superior Norte (R,V)", portoes:["Portão R","Portão V"] },
  { setor:"Gold Oeste (A)", portoes:["Portão A"] },
  { setor:"Gold Leste (N)", portoes:["Portão N"] },
  { setor:"Gold Premium Sul (G)", portoes:["Portão G"] },
  { setor:"Visitante", portoes:["Portão 6"] },
  { setor:"Totens", portoes:["Toten A conselho","Toten A camarote","Toten N camarote","N-1 Tribuna (dir.)","N-1 Tribuna (esq.)","Toten 1/2","Toten 3/4","Toten 5","Toten 6","Toten 8","Toten 10/11","Toten 12/13","Toten 15/16/17"] },
];

const LIDERES = ["Guilherme","Rafael","Keven","Sheron","Alex sandro","Ebert","Átila","Andrieli","Cristian","Fábio","Jesse","Franciely","Emily","Tainá"];

function formatCPF(v) {
  const d = v.replace(/\D/g,"").slice(0,11);
  if(d.length<=3) return d;
  if(d.length<=6) return d.slice(0,3)+"."+d.slice(3);
  if(d.length<=9) return d.slice(0,3)+"."+d.slice(3,6)+"."+d.slice(6);
  return d.slice(0,3)+"."+d.slice(3,6)+"."+d.slice(6,9)+"-"+d.slice(9);
}
function validateCPF(cpf){ return cpf.replace(/\D/g,"").length===11; }
function formatPassaporte(v){ return v.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,20); }

function LogoGremio({size=48}){
  return(
    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Gr%C3%AAmio_Foot-Ball_Porto_Alegrense_logo.svg/800px-Gr%C3%AAmio_Foot-Ball_Porto_Alegrense_logo.svg.png"
      alt="Logo" width={size} height={size}
      style={{objectFit:"contain",filter:"drop-shadow(0 2px 8px rgba(0,0,0,0.4))"}}
      onError={e=>e.target.style.display="none"}/>
  );
}

function MotivoBadge({motivo}){
  const paleta={
    "Criança":"#E3F2FD,#1565C0","Idoso(a)":"#E8F5E9,#2E7D32",
    "Sócio inadimplente":"#FFF3E0,#E65100","Transferência":"#EDE7F6,#4527A0",
    "Setor incorreto":"#FFF8E1,#F57F17","Acesso já utilizado":"#FCE4EC,#C62828",
    "Responsável já acessou":"#F3E5F5,#6A1B9A","Catraca com defeito":"#EFEBE9,#4E342E",
    "Outros":"#F1F5F9,#334155",
  };
  const label = motivo.startsWith("Outros:") ? "Outros" : motivo;
  const [bg,cor]=(paleta[label]||"#F5F5F5,#424242").split(",");
  return <span style={{background:bg,color:cor,border:"1px solid "+cor+"44",padding:"2px 9px",borderRadius:99,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>;
}

function RegistroCard({r,onDelete,isAdmin}){
  const abrev=r.portao.replace("Portão ","").replace("Toten ","T.").slice(0,4);
  return(
    <div style={{background:G.branco,borderRadius:10,border:"1.5px solid "+G.cinzaBorda,padding:"14px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"flex-start",boxShadow:"0 1px 6px rgba(0,85,165,0.07)"}}>
      <div style={{minWidth:40,height:40,borderRadius:8,background:G.azul,display:"flex",alignItems:"center",justifyContent:"center",color:G.branco,fontWeight:900,fontSize:12,textAlign:"center",lineHeight:1.2,padding:2}}>{abrev}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:5}}>
          <MotivoBadge motivo={r.motivo}/>
          <span style={{fontSize:11,color:G.cinzaTexto}}>{r.data} · {r.hora}</span>
        </div>
        {r.motivo.startsWith("Outros:")&&(
          <div style={{fontSize:11,color:G.cinzaTexto,marginBottom:4,fontStyle:"italic"}}>"{r.motivo.replace("Outros: ","")}"</div>
        )}
        <div style={{fontSize:13,color:"#1a1a1a",marginBottom:2}}>
          <span style={{fontWeight:700,color:G.azulEscuro}}>DOC:</span>{" "}
          <span style={{fontFamily:"monospace",background:"#f1f5f9",padding:"1px 6px",borderRadius:4,fontSize:12}}>{r.docMascarado||"****"}</span>
          <span style={{margin:"0 7px",color:G.cinzaBorda}}>|</span>
          <span style={{fontWeight:700,color:G.azulEscuro}}>Portão:</span> {r.portao}
        </div>
        <div style={{fontSize:12,color:G.cinzaTexto}}><span style={{fontWeight:700}}>Líder:</span> {r.lider}</div>
      </div>
      {isAdmin&&(
        <button onClick={()=>onDelete(r.id)} style={{background:"none",border:"none",color:G.cinzaBorda,cursor:"pointer",fontSize:20,lineHeight:1,padding:2,transition:"color 0.2s"}} onMouseEnter={e=>e.target.style.color="#DC2626"} onMouseLeave={e=>e.target.style.color=G.cinzaBorda}>×</button>
      )}
    </div>
  );
}

// ── Card de historico (sem botao apagar, mostra info do jogo) ─────────────────
function HistoricoCard({r, numero}){
  const abrev=r.portao.replace("Portão ","").replace("Toten ","T.").slice(0,4);
  const alerta = numero > 1;
  return(
    <div style={{background:G.branco,borderRadius:10,border:"1.5px solid "+(alerta?"#FECACA":G.cinzaBorda),padding:"12px 14px",marginBottom:8,display:"flex",gap:12,alignItems:"flex-start",boxShadow:"0 1px 6px rgba(0,85,165,0.07)"}}>
      <div style={{minWidth:36,height:36,borderRadius:8,background:alerta?"#DC2626":G.azulMedio,display:"flex",alignItems:"center",justifyContent:"center",color:G.branco,fontWeight:900,fontSize:14}}>
        #{numero}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
          <MotivoBadge motivo={r.motivo}/>
          {alerta&&<span style={{fontSize:10,fontWeight:800,color:"#DC2626",background:"#FEF2F2",border:"1px solid #FECACA",padding:"1px 7px",borderRadius:99}}>⚠️ REINCIDENTE</span>}
        </div>
        <div style={{fontSize:12,color:G.cinzaTexto}}>
          <span style={{fontWeight:700,color:G.azulEscuro}}>Data:</span> {r.data} às {r.hora}
          <span style={{margin:"0 7px",color:G.cinzaBorda}}>|</span>
          <span style={{fontWeight:700,color:G.azulEscuro}}>Portão:</span> {r.portao}
        </div>
        <div style={{fontSize:12,color:G.cinzaTexto,marginTop:2}}><span style={{fontWeight:700}}>Líder:</span> {r.lider}</div>
      </div>
    </div>
  );
}

// ── TELA DE LOGIN ─────────────────────────────────────────────────────────────
function TelaLogin({onLogin}){
  const [pin,setPin]=useState("");
  const [erro,setErro]=useState("");
  const [tentando,setTentando]=useState(false);

  const handleLogin=async()=>{
    if(!pin.trim()) return;
    setTentando(true);
    try{
      // Testa admin primeiro, depois app
      const isAdmin = await verificarPin(pin,"admin");
      if(isAdmin){ sessionStorage.setItem("op_auth","1"); sessionStorage.setItem("op_nivel","admin"); onLogin("admin"); setTentando(false); return; }
      const isApp = await verificarPin(pin,"app");
      if(isApp){ sessionStorage.setItem("op_auth","1"); sessionStorage.setItem("op_nivel","user"); onLogin("user"); }
      else { setErro("Acesso negado. Tente novamente."); setPin(""); setTimeout(()=>setErro(""),3000); }
    } catch(e){ setErro("Erro de conexão."); }
    setTentando(false);
  };

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,"+G.preto+" 0%,"+G.azulEscuro+" 50%,"+G.azul+" 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Barlow','Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;900&family=Barlow+Condensed:wght@700;900&family=DM+Mono:wght@500&display=swap');@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
      <div style={{position:"fixed",top:0,left:0,right:0,height:5,background:"linear-gradient(90deg,"+G.preto+" 33%,"+G.azul+" 33%,"+G.azul+" 66%,"+G.branco+" 66%)"}}/>
      <div style={{width:"100%",maxWidth:360,textAlign:"center"}}>
        <div style={{marginBottom:24,filter:"drop-shadow(0 8px 24px rgba(0,0,0,0.5))"}}>
          <LogoGremio size={100}/>
        </div>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:26,fontWeight:900,color:G.branco,letterSpacing:2,textTransform:"uppercase",lineHeight:1,marginBottom:4}}>Controle de Acesso</div>
        <div style={{fontSize:12,color:"#94BDDF",marginBottom:36,fontWeight:600}}>Sistema Interno · Operação de Acesso</div>
        <div style={{background:"rgba(255,255,255,0.07)",borderRadius:16,border:"1px solid rgba(255,255,255,0.12)",padding:"28px 24px"}}>
          <div style={{fontSize:13,fontWeight:800,color:"#94BDDF",marginBottom:14,textTransform:"uppercase",letterSpacing:1}}>🔒 Acesso Restrito</div>
          <input type="password" placeholder="Digite o PIN de acesso" value={pin}
            onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()}
            style={{width:"100%",padding:"13px 16px",borderRadius:9,fontSize:16,border:"1.5px solid "+(erro?"#F87171":"rgba(255,255,255,0.2)"),background:"rgba(255,255,255,0.1)",color:G.branco,fontFamily:"'DM Mono',monospace",letterSpacing:3,textAlign:"center",outline:"none",boxSizing:"border-box",marginBottom:14,animation:erro?"shake 0.4s ease":"none"}} autoComplete="off"/>
          {erro&&<div style={{fontSize:12,color:"#F87171",marginBottom:12,fontWeight:700}}>❌ {erro}</div>}
          <button onClick={handleLogin} disabled={tentando||!pin.trim()}
            style={{width:"100%",padding:"13px",borderRadius:9,background:!pin.trim()?"rgba(255,255,255,0.1)":"linear-gradient(135deg,"+G.azulEscuro+","+G.azulMedio+")",color:!pin.trim()?"#64748b":G.branco,border:"none",fontSize:15,fontWeight:900,cursor:!pin.trim()?"not-allowed":"pointer",fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase",letterSpacing:1}}>
            {tentando?"Verificando...":"Entrar →"}
          </button>
        </div>
        <div style={{marginTop:20,fontSize:10,color:"#334155",fontWeight:600}}>Sistema Interno · Acesso Monitorado</div>
      </div>
    </div>
  );
}

function ModalAdminPin({onConfirm,onCancel}){
  const [pin,setPin]=useState("");
  const [erro,setErro]=useState("");
  const [tentando,setTentando]=useState(false);

  const handleConfirm=async()=>{
    if(!pin.trim()) return;
    setTentando(true);
    try{
      const ok=await verificarPin(pin,"admin");
      if(ok){ onConfirm(pin); }
      else { setErro("Acesso negado."); setPin(""); setTimeout(()=>setErro(""),3000); }
    } catch(e){ setErro("Erro de conexão."); }
    setTentando(false);
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
      <div style={{background:G.branco,borderRadius:16,padding:"28px 24px",width:"100%",maxWidth:340,boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
        <div style={{fontSize:16,fontWeight:900,color:G.azulEscuro,marginBottom:6,fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase"}}>🔐 Autorização Necessária</div>
        <div style={{fontSize:12,color:G.cinzaTexto,marginBottom:20}}>Digite o PIN de administrador para continuar. Esta ação será registrada.</div>
        <input type="password" placeholder="PIN de administrador" value={pin}
          onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleConfirm()}
          style={{width:"100%",padding:"11px 14px",borderRadius:8,fontSize:15,border:"1.5px solid "+(erro?"#DC2626":G.cinzaBorda),fontFamily:"'DM Mono',monospace",letterSpacing:2,textAlign:"center",outline:"none",boxSizing:"border-box",marginBottom:8}}
          autoFocus autoComplete="off"/>
        {erro&&<div style={{fontSize:11,color:"#DC2626",marginBottom:10,fontWeight:700}}>❌ {erro}</div>}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <button onClick={onCancel} style={{flex:1,padding:"11px",borderRadius:8,border:"1.5px solid "+G.cinzaBorda,background:G.branco,cursor:"pointer",fontWeight:700,fontFamily:"inherit",color:G.cinzaTexto}}>Cancelar</button>
          <button onClick={handleConfirm} disabled={tentando||!pin.trim()}
            style={{flex:1,padding:"11px",borderRadius:8,border:"none",background:G.azul,color:G.branco,cursor:"pointer",fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase"}}>
            {tentando?"Verificando...":"Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── APP PRINCIPAL ─────────────────────────────────────────────────────────────
export default function App(){
  const [autenticado,setAutenticado]=useState(()=>sessionStorage.getItem("op_auth")==="1");
  const [nivelAcesso,setNivelAcesso]=useState(()=>sessionStorage.getItem("op_nivel")||"user");
  const isAdmin = nivelAcesso==="admin";

  const [liderAtual,setLiderAtual]=useState(sessionStorage.getItem("op_lider")||"");
  const [tab,setTab]=useState("form");
  const [registros,setRegistros]=useState([]);
  const [form,setForm]=useState({motivo:"",outrosDesc:"",portao:"",lider:liderAtual,doc:"",tipoDoc:"cpf"});
  const [errors,setErrors]=useState({});
  const [success,setSuccess]=useState(false);
  const [filtro,setFiltro]=useState("");
  const [exportando,setExportando]=useState(false);
  const [loading,setLoading]=useState(true);
  const [salvando,setSalvando]=useState(false);
  const [dbErro,setDbErro]=useState(null);
  const [showAdminPin,setShowAdminPin]=useState(false);

  // Historico
  const [buscaDoc,setBuscaDoc]=useState("");
  const [buscaTipo,setBuscaTipo]=useState("cpf");
  const [buscando,setBuscando]=useState(false);
  const [historico,setHistorico]=useState(null);
  
  
  

  const carregarRegistros=useCallback(async()=>{
    setLoading(true);
    const {data,error}=await supabase.from("atendimentos").select("id,portao,lider,hora,data,motivo,cpf").order("created_at",{ascending:false});
    if(error){ setDbErro("Erro ao carregar dados."); setLoading(false); return; }
    setRegistros(data.map(r=>({
      id:r.id,portao:r.portao,lider:r.lider,hora:r.hora,data:r.data,
      motivo:r.motivo,docCriptografado:r.cpf,docMascarado:"****",
    })));
    setLoading(false);
  },[]);

  useEffect(()=>{ if(autenticado) carregarRegistros(); },[autenticado,carregarRegistros]);

  useEffect(()=>{
    if(!autenticado) return;
    const channel=supabase.channel("op-rt")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"atendimentos"},payload=>{
        const r=payload.new;
        setRegistros(prev=>prev.find(x=>x.id===r.id)?prev:[{
          id:r.id,portao:r.portao,lider:r.lider,hora:r.hora,data:r.data,
          motivo:r.motivo,docCriptografado:r.cpf,docMascarado:"****",
        },...prev]);
      })
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"atendimentos"},payload=>{
        setRegistros(prev=>prev.filter(x=>x.id!==payload.old.id));
      })
      .subscribe();
    return()=>supabase.removeChannel(channel);
  },[autenticado]);

  const validate=()=>{
    const e={};
    if(!form.motivo) e.motivo="Selecione o motivo";
    if(form.motivo==="Outros"&&!form.outrosDesc.trim()) e.outrosDesc="Descreva o motivo";
    if(!form.portao) e.portao="Selecione o portão";
    if(!form.lider) e.lider="Selecione o líder";
    if(form.tipoDoc==="cpf"&&!validateCPF(form.doc)) e.doc="Documento inválido";
    if(form.tipoDoc==="outros"&&!form.doc.trim()) e.doc="Documento obrigatório";
    return e;
  };

  const handleSubmit=async()=>{
    const e=validate(); setErrors(e);
    if(Object.keys(e).length>0) return;
    setSalvando(true);
    try{
      const now=new Date();
      const hora=now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
      const data=now.toLocaleDateString("pt-BR");
      const motivoFinal=form.motivo==="Outros"?"Outros: "+form.outrosDesc.trim():form.motivo;
      const docCriptografado=await criptografarDoc(form.doc);
      const {error}=await supabase.from("atendimentos").insert([{
        cpf:docCriptografado,motivo:motivoFinal,portao:form.portao,lider:form.lider,hora,data
      }]);
      if(error) throw new Error(error.message);
      setForm(f=>({...f,motivo:"",outrosDesc:"",doc:"",tipoDoc:"cpf"}));
      setSuccess(true); setTimeout(()=>setSuccess(false),2800);
    } catch(err){ setDbErro("Erro ao salvar: "+err.message); }
    setSalvando(false);
  };

  const handleDelete=async(id)=>{
    if(!isAdmin) return;
    const {error}=await supabase.from("atendimentos").delete().eq("id",id);
    if(error) setDbErro("Erro ao excluir.");
  };

  // Busca historico — descriptografa todos e compara
  const buscarHistorico=async()=>{
    
    setBuscando(true);
    setHistorico(null);
    try{
      const docBusca = buscaDoc.trim();
      const encontrados=[];
      for(const r of registros){
        try{
          const dec=await descriptografarDoc(r.docCriptografado, "HISTORY_INTERNAL");
          const normalizado = dec.replace(/\D/g,"");
          const buscaNorm = docBusca.replace(/\D/g,"");
          const match = buscaTipo==="cpf"
            ? normalizado===buscaNorm
            : dec.toUpperCase()===docBusca.toUpperCase();
          if(match) encontrados.push(r);
        }catch(e){}
      }
      setHistorico(encontrados);
      
    }catch(e){ setDbErro("Erro na busca: "+e.message); }
    setBuscando(false);
  };

  const handleExportarComAdmin=async(adminPin)=>{
    setShowAdminPin(false);
    setExportando(true);
    try{
      const docsDescriptografados=await Promise.all(
        registros.map(async r=>{
          try{ return await descriptografarDoc(r.docCriptografado,adminPin); }
          catch(e){ return "ERRO"; }
        })
      );
      await registrarLog(adminPin,liderAtual||"admin",registros.length);
      const wb=XLSX.utils.book_new();
      const ws1=XLSX.utils.json_to_sheet(registros.map((r,i)=>({
        "#":i+1,"Data":r.data,"Hora":r.hora,"DOC":docsDescriptografados[i],
        "Motivo":r.motivo,"Portão":r.portao,"Líder":r.lider,
      })));
      ws1["!cols"]=[{wch:4},{wch:12},{wch:8},{wch:20},{wch:30},{wch:22},{wch:20}];
      XLSX.utils.book_append_sheet(wb,ws1,"Registros");
      const porMotivo=registros.reduce((acc,r)=>{const k=r.motivo.startsWith("Outros:")?"Outros":r.motivo;acc[k]=(acc[k]||0)+1;return acc;},{});
      const ws2=XLSX.utils.json_to_sheet([...Object.entries(porMotivo).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({"Motivo":k,"Qtd":v})),{"Motivo":"TOTAL","Qtd":registros.length}]);
      XLSX.utils.book_append_sheet(wb,ws2,"Por Motivo");
      const porPortao=registros.reduce((acc,r)=>{acc[r.portao]=(acc[r.portao]||0)+1;return acc;},{});
      const ws3=XLSX.utils.json_to_sheet([...Object.entries(porPortao).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({"Portão":k,"Qtd":v})),{"Portão":"TOTAL","Qtd":registros.length}]);
      XLSX.utils.book_append_sheet(wb,ws3,"Por Portão");
      const porLider=registros.reduce((acc,r)=>{acc[r.lider]=(acc[r.lider]||0)+1;return acc;},{});
      const ws4=XLSX.utils.json_to_sheet([...Object.entries(porLider).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({"Líder":k,"Qtd":v})),{"Líder":"TOTAL","Qtd":registros.length}]);
      XLSX.utils.book_append_sheet(wb,ws4,"Por Líder");
      const now=new Date();
      XLSX.writeFile(wb,"relatorio_acesso_"+now.toLocaleDateString("pt-BR").replace(/\//g,"-")+".xlsx");
    }catch(err){ setDbErro("Erro ao exportar: "+err.message); }
    setExportando(false);
  };

  const hoje=new Date().toLocaleDateString("pt-BR");
  const registrosHoje=useMemo(()=>registros.filter(r=>r.data===hoje),[registros,hoje]);
  const filtered=useMemo(()=>{
    if(!filtro.trim()) return registrosHoje;
    const q=filtro.toLowerCase();
    return registrosHoje.filter(r=>r.motivo.toLowerCase().includes(q)||r.portao.toLowerCase().includes(q)||r.lider.toLowerCase().includes(q));
  },[registros,filtro]);

  const stats=useMemo(()=>{
    const hoje=new Date().toLocaleDateString("pt-BR");
    const hc=registros.filter(r=>r.data===hoje).length;
    const pp=registros.reduce((acc,r)=>{acc[r.portao]=(acc[r.portao]||0)+1;return acc;},{});
    const tp=Object.entries(pp).sort((a,b)=>b[1]-a[1])[0];
    return{total:registros.length,hoje:hc,top:tp?tp[0].replace("Portão ","P."):"—"};
  },[registros]);

  const resumo=useMemo(()=>{
    const porMotivo=registros.reduce((acc,r)=>{const k=r.motivo.startsWith("Outros:")?"Outros":r.motivo;acc[k]=(acc[k]||0)+1;return acc;},{});
    const porPortao=registros.reduce((acc,r)=>{acc[r.portao]=(acc[r.portao]||0)+1;return acc;},{});
    const porLider=registros.reduce((acc,r)=>{acc[r.lider]=(acc[r.lider]||0)+1;return acc;},{});
    return{porMotivo,porPortao,porLider};
  },[registros]);

  if(!autenticado) return <TelaLogin onLogin={(nivel)=>{ setNivelAcesso(nivel); setAutenticado(true); }}/>;

  const inp=(err)=>({width:"100%",padding:"10px 12px",borderRadius:7,fontSize:14,border:"1.5px solid "+(err?"#DC2626":G.cinzaBorda),background:G.branco,color:G.preto,outline:"none",fontFamily:"inherit",appearance:"none",backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%230055A5' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center"});
  const lbl={fontSize:11,fontWeight:800,color:G.azulEscuro,marginBottom:5,display:"block",letterSpacing:0.8,textTransform:"uppercase"};
  const errStyle={fontSize:11,color:"#DC2626",marginTop:4};
  const TABS=[["form","✏️ Registrar"],["lista","📋 Hoje ("+registrosHoje.length+")"],["historico","🔍 Histórico"],["relatorio","📊 Relatório"]];

  return(
    <div style={{minHeight:"100vh",background:G.cinzaClaro,fontFamily:"'Barlow','Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;900&family=Barlow+Condensed:wght@700;900&family=DM+Mono:wght@500&display=swap');@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}@keyframes slideDown{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}@keyframes spin{to{transform:rotate(360deg)}}select:focus,input:focus,textarea:focus{border-color:${G.azul}!important;box-shadow:0 0 0 3px rgba(0,85,165,0.15)!important;outline:none}optgroup{font-weight:800;color:${G.azulEscuro};font-size:12px}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:${G.azulMedio};border-radius:99px}`}</style>

      {showAdminPin&&<ModalAdminPin onConfirm={handleExportarComAdmin} onCancel={()=>setShowAdminPin(false)}/>}


      {/* HEADER */}
      <div style={{background:"linear-gradient(135deg,"+G.preto+" 0%,"+G.azulEscuro+" 40%,"+G.azul+" 100%)",padding:"0 20px",boxShadow:"0 4px 20px rgba(0,0,0,0.4)"}}>
        <div style={{height:4,background:"linear-gradient(90deg,"+G.preto+" 33%,"+G.azul+" 33%,"+G.azul+" 66%,"+G.branco+" 66%)"}}/>
        <div style={{maxWidth:680,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0 10px"}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <LogoGremio size={48}/>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:18,fontWeight:900,color:G.branco,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1,textTransform:"uppercase",lineHeight:1}}>Controle de Acesso</div>
                  {isAdmin&&<span style={{fontSize:9,fontWeight:800,background:G.dourado,color:G.preto,padding:"2px 6px",borderRadius:99,letterSpacing:0.5}}>ADMIN</span>}
                </div>
                <div style={{fontSize:11,color:"#94BDDF",marginTop:2,fontWeight:600}}>Sistema Interno · Operação de Acesso</div>
              </div>
            </div>
            <button onClick={()=>{sessionStorage.clear();setAutenticado(false);setNivelAcesso("user");}} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#94BDDF",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>🔒 Sair</button>
          </div>
          <div style={{display:"flex",gap:10,paddingBottom:12}}>
            {[{label:"Total",value:stats.total,icon:"📋"},{label:"Hoje",value:stats.hoje,icon:"📅"},{label:"Top Portão",value:stats.top,icon:"🚪"}].map(s=>(
              <div key={s.label} style={{flex:1,background:"rgba(255,255,255,0.08)",borderRadius:9,padding:"9px 10px",textAlign:"center",border:"1px solid rgba(255,255,255,0.12)"}}>
                <div style={{fontSize:16}}>{s.icon}</div>
                <div style={{fontSize:20,fontWeight:900,color:G.branco,lineHeight:1.1,fontFamily:"'Barlow Condensed',sans-serif"}}>{s.value}</div>
                <div style={{fontSize:9,color:"#7AAED4",marginTop:1,textTransform:"uppercase",letterSpacing:0.6,fontWeight:700}}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:2,overflowX:"auto"}}>
            {TABS.map(([t,label])=>(
              <button key={t} onClick={()=>setTab(t)} style={{padding:"9px 14px",borderRadius:"8px 8px 0 0",border:"none",cursor:"pointer",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:12,background:tab===t?G.cinzaClaro:"transparent",color:tab===t?G.azulEscuro:"#94BDDF",transition:"all 0.2s",whiteSpace:"nowrap"}}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{maxWidth:680,margin:"0 auto",padding:"20px 16px 50px"}}>
        {dbErro&&(<div style={{background:"#FEF2F2",border:"1.5px solid #FECACA",color:"#991B1B",borderRadius:9,padding:"11px 16px",marginBottom:16,fontWeight:600,fontSize:13,display:"flex",justifyContent:"space-between",alignItems:"center"}}>⚠️ {dbErro}<button onClick={()=>setDbErro(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#991B1B",fontSize:18}}>×</button></div>)}
        {success&&(<div style={{background:"#EBF8EE",border:"1.5px solid #4ADE80",color:"#166534",borderRadius:9,padding:"11px 16px",marginBottom:16,fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:9,animation:"slideDown 0.3s ease"}}><span style={{fontSize:18}}>⚽</span> Atendimento salvo com sucesso!</div>)}

        {/* FORM */}
        {tab==="form"&&(
          <div style={{background:G.branco,borderRadius:12,border:"1.5px solid "+G.cinzaBorda,padding:"22px 20px",boxShadow:"0 2px 12px rgba(0,85,165,0.09)",animation:"fadeIn 0.3s ease"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,paddingBottom:14,borderBottom:"2px solid "+G.cinzaClaro}}>
              <div style={{width:4,height:22,background:G.azul,borderRadius:2}}/>
              <span style={{fontSize:15,fontWeight:900,color:G.azulEscuro,fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase",letterSpacing:1}}>Novo Atendimento</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div style={{gridColumn:"1 / -1"}}>
                <label style={lbl}>Motivo da Liberação *</label>
                <select style={inp(errors.motivo)} value={form.motivo} onChange={e=>setForm(f=>({...f,motivo:e.target.value,outrosDesc:""}))}>
                  <option value="">Selecione o motivo...</option>
                  {MOTIVOS_LIBERACAO.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
                {errors.motivo&&<div style={errStyle}>{errors.motivo}</div>}
              </div>
              {form.motivo==="Outros"&&(
                <div style={{gridColumn:"1 / -1",animation:"fadeIn 0.2s ease"}}>
                  <label style={lbl}>Descreva o motivo *</label>
                  <textarea placeholder="Descreva o motivo da liberação..." value={form.outrosDesc}
                    onChange={e=>setForm(f=>({...f,outrosDesc:e.target.value}))} rows={3}
                    style={{...inp(errors.outrosDesc),resize:"vertical",backgroundImage:"none",lineHeight:1.5}}/>
                  {errors.outrosDesc&&<div style={errStyle}>{errors.outrosDesc}</div>}
                </div>
              )}
              <div style={{gridColumn:"1 / -1"}}>
                <label style={lbl}>Portão / Setor *</label>
                <select style={inp(errors.portao)} value={form.portao} onChange={e=>setForm(f=>({...f,portao:e.target.value}))}>
                  <option value="">Selecione o portão...</option>
                  {SETORES_PORTOES.map(s=><optgroup key={s.setor} label={"— "+s.setor}>{s.portoes.map(p=><option key={p} value={p}>{p}</option>)}</optgroup>)}
                </select>
                {errors.portao&&<div style={errStyle}>{errors.portao}</div>}
              </div>
              <div>
                <label style={lbl}>Líder Responsável *</label>
                <select style={inp(errors.lider)} value={form.lider} onChange={e=>{setForm(f=>({...f,lider:e.target.value}));sessionStorage.setItem("op_lider",e.target.value);}}>
                  <option value="">Selecione...</option>
                  {LIDERES.map(l=><option key={l} value={l}>{l}</option>)}
                </select>
                {errors.lider&&<div style={errStyle}>{errors.lider}</div>}
              </div>
              <div>
                <label style={lbl}>DOC *</label>
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  {[["cpf","DOC"],["outros","OUTROS"]].map(([val,label])=>(
                    <button key={val} onClick={()=>setForm(f=>({...f,tipoDoc:val,doc:""}))}
                      style={{flex:1,padding:"7px",borderRadius:7,border:"1.5px solid "+(form.tipoDoc===val?G.azul:G.cinzaBorda),background:form.tipoDoc===val?G.azul:G.branco,color:form.tipoDoc===val?G.branco:G.cinzaTexto,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
                      {label}
                    </button>
                  ))}
                </div>
                {form.tipoDoc==="cpf"?(
                  <input type="text" placeholder="000.000.000-00" value={form.doc}
                    onChange={e=>setForm(f=>({...f,doc:formatCPF(e.target.value)}))}
                    style={{...inp(errors.doc),fontFamily:"'DM Mono',monospace",letterSpacing:1.2,backgroundImage:"none"}}/>
                ):(
                  <input type="text" placeholder="Ex: AB123456" value={form.doc}
                    onChange={e=>setForm(f=>({...f,doc:formatPassaporte(e.target.value)}))}
                    style={{...inp(errors.doc),fontFamily:"'DM Mono',monospace",letterSpacing:1.5,backgroundImage:"none",textTransform:"uppercase"}}/>
                )}
                {errors.doc&&<div style={errStyle}>{errors.doc}</div>}
              </div>
            </div>
            <button onClick={handleSubmit} disabled={salvando}
              style={{width:"100%",marginTop:20,padding:"13px",background:salvando?"#94a3b8":"linear-gradient(135deg,"+G.azulEscuro+","+G.azul+")",color:G.branco,border:"none",borderRadius:9,fontSize:15,fontWeight:900,cursor:salvando?"not-allowed":"pointer",letterSpacing:0.8,fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase",boxShadow:"0 3px 12px rgba(0,85,165,0.35)"}}>
              {salvando?"⏳ Salvando...":"⚽ Registrar Atendimento"}
            </button>
          </div>
        )}

        {/* LISTA */}
        {tab==="lista"&&(
          <div style={{animation:"fadeIn 0.3s ease"}}>
            <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center"}}>
              <input type="text" placeholder="🔍  Buscar nos registros de hoje..." value={filtro}
                onChange={e=>setFiltro(e.target.value)}
                style={{flex:1,padding:"11px 14px",borderRadius:9,fontSize:14,border:"1.5px solid "+G.cinzaBorda,background:G.branco,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
              <button onClick={carregarRegistros} title="Atualizar" style={{padding:"11px 13px",borderRadius:9,border:"1.5px solid "+G.cinzaBorda,background:G.branco,cursor:"pointer",fontSize:16,color:G.azul}}>🔄</button>
            </div>
            {!isAdmin&&(
              <div style={{fontSize:11,color:G.cinzaTexto,marginBottom:12,background:"#F8FAFC",border:"1px solid "+G.cinzaBorda,borderRadius:7,padding:"7px 12px"}}>
                Visualização somente leitura.
              </div>
            )}
            {loading?(
              <div style={{textAlign:"center",padding:"40px",color:G.cinzaTexto}}>
                <div style={{fontSize:32,marginBottom:8,animation:"spin 1s linear infinite",display:"inline-block"}}>⚙️</div>
                <div style={{fontWeight:700}}>Carregando registros...</div>
              </div>
            ):filtered.length===0?(
              <div style={{textAlign:"center",padding:"44px 20px",color:G.cinzaTexto}}>
                <div style={{fontSize:42,marginBottom:10}}>📭</div>
                <div style={{fontWeight:800,fontSize:15,color:G.azulEscuro}}>{registrosHoje.length===0?"Nenhum registro hoje":"Sem resultados"}</div>
              </div>
            ):(
              <>
                <div style={{fontSize:12,color:G.cinzaTexto,marginBottom:10,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>{filtered.length} registro{filtered.length!==1?"s":""}</div>
                {filtered.map(r=><RegistroCard key={r.id} r={r} onDelete={handleDelete} isAdmin={isAdmin}/>)}
              </>
            )}
          </div>
        )}

        {/* HISTÓRICO */}
        {tab==="historico"&&(
          <div style={{animation:"fadeIn 0.3s ease"}}>
            <div style={{background:G.branco,borderRadius:12,border:"1.5px solid "+G.cinzaBorda,padding:"20px",marginBottom:14,boxShadow:"0 2px 12px rgba(0,85,165,0.09)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,paddingBottom:12,borderBottom:"2px solid "+G.cinzaClaro}}>
                <div style={{width:4,height:22,background:G.azul,borderRadius:2}}/>
                <span style={{fontSize:15,fontWeight:900,color:G.azulEscuro,fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase",letterSpacing:1}}>Consultar Histórico</span>
              </div>
              <div style={{fontSize:12,color:G.cinzaTexto,marginBottom:14}}>
                Verifique se o torcedor já foi liberado em jogos anteriores.
              </div>
              <div style={{display:"flex",gap:6,marginBottom:10}}>
                {[["cpf","DOC"],["outros","OUTROS"]].map(([val,label])=>(
                  <button key={val} onClick={()=>{setBuscaTipo(val);setBuscaDoc("");setHistorico(null);}}
                    style={{flex:1,padding:"7px",borderRadius:7,border:"1.5px solid "+(buscaTipo===val?G.azul:G.cinzaBorda),background:buscaTipo===val?G.azul:G.branco,color:buscaTipo===val?G.branco:G.cinzaTexto,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:10}}>
                {buscaTipo==="cpf"?(
                  <input type="text" placeholder="000.000.000-00" value={buscaDoc}
                    onChange={e=>setBuscaDoc(formatCPF(e.target.value))}
                    style={{flex:1,padding:"11px 14px",borderRadius:9,fontSize:14,border:"1.5px solid "+G.cinzaBorda,fontFamily:"'DM Mono',monospace",letterSpacing:1.2,outline:"none",boxSizing:"border-box"}}/>
                ):(
                  <input type="text" placeholder="Ex: AB123456" value={buscaDoc}
                    onChange={e=>setBuscaDoc(formatPassaporte(e.target.value))}
                    style={{flex:1,padding:"11px 14px",borderRadius:9,fontSize:14,border:"1.5px solid "+G.cinzaBorda,fontFamily:"'DM Mono',monospace",letterSpacing:1.5,outline:"none",boxSizing:"border-box",textTransform:"uppercase"}}/>
                )}
                <button
                  onClick={()=>{ if(!buscaDoc.trim()) return; buscarHistorico(); }}
                  disabled={buscando||!buscaDoc.trim()}
                  style={{padding:"11px 18px",borderRadius:9,border:"none",background:!buscaDoc.trim()?G.cinzaClaro:"linear-gradient(135deg,"+G.azulEscuro+","+G.azul+")",color:!buscaDoc.trim()?G.cinzaTexto:G.branco,fontWeight:800,cursor:!buscaDoc.trim()?"not-allowed":"pointer",fontFamily:"'Barlow',sans-serif",fontSize:13,whiteSpace:"nowrap"}}>
                  {buscando?"⏳ Buscando...":"🔍 Buscar"}
                </button>
              </div>
            </div>

            {buscando&&(
              <div style={{textAlign:"center",padding:"30px",color:G.cinzaTexto}}>
                <div style={{fontSize:28,marginBottom:8,animation:"spin 1s linear infinite",display:"inline-block"}}>⚙️</div>
                <div style={{fontWeight:700,fontSize:13}}>Consultando histórico...</div>
              </div>
            )}

            {historico!==null&&!buscando&&(
              <div style={{animation:"fadeIn 0.3s ease"}}>
                {historico.length===0?(
                  <div style={{background:"#F0FDF4",border:"1.5px solid #86EFAC",borderRadius:12,padding:"24px",textAlign:"center"}}>
                    <div style={{fontSize:32,marginBottom:8}}>✅</div>
                    <div style={{fontWeight:800,fontSize:15,color:"#166534"}}>Nenhum registro encontrado</div>
                    <div style={{fontSize:13,color:"#4ADE80",marginTop:4}}>Primeira liberação para este documento</div>
                  </div>
                ):(
                  <>
                    <div style={{background:historico.length>1?"#FEF2F2":"#FFF8E1",border:"1.5px solid "+(historico.length>1?"#FECACA":"#FDE68A"),borderRadius:12,padding:"14px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
                      <div style={{fontSize:28}}>{historico.length>1?"⚠️":"ℹ️"}</div>
                      <div>
                        <div style={{fontWeight:900,fontSize:14,color:historico.length>1?"#991B1B":"#92400E"}}>
                          {historico.length>1?`Atenção: ${historico.length} registros encontrados — REINCIDENTE`:`1 registro encontrado — Primeira liberação`}
                        </div>
                        <div style={{fontSize:12,color:historico.length>1?"#DC2626":"#B45309",marginTop:2}}>
                          {historico.length>1?"Este torcedor já foi liberado anteriormente. Verifique com atenção.":"Documento localizado no histórico de atendimentos."}
                        </div>
                      </div>
                    </div>
                    {historico.map((r,i)=><HistoricoCard key={r.id} r={r} numero={i+1}/>)}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* RELATÓRIO */}
        {tab==="relatorio"&&(
          <div style={{animation:"fadeIn 0.3s ease"}}>
            <div style={{background:G.branco,borderRadius:12,border:"1.5px solid "+G.cinzaBorda,padding:"18px 20px",marginBottom:14,boxShadow:"0 2px 12px rgba(0,85,165,0.09)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                <div>
                  <div style={{fontSize:15,fontWeight:900,color:G.azulEscuro,fontFamily:"'Barlow Condensed',sans-serif",textTransform:"uppercase",letterSpacing:0.5}}>Exportar Relatório Excel</div>
                  <div style={{fontSize:12,color:G.cinzaTexto,marginTop:3}}>{registros.length} registro{registros.length!==1?"s":""} · Requer autorização</div>
                </div>
                <button onClick={()=>setShowAdminPin(true)} disabled={registros.length===0||exportando}
                  style={{background:registros.length===0?G.cinzaClaro:"linear-gradient(135deg,"+G.azulEscuro+","+G.azul+")",color:registros.length===0?G.cinzaTexto:G.branco,border:"none",borderRadius:9,padding:"10px 18px",fontSize:13,fontWeight:800,cursor:registros.length===0?"not-allowed":"pointer",fontFamily:"'Barlow',sans-serif",whiteSpace:"nowrap",boxShadow:registros.length>0?"0 3px 10px rgba(0,85,165,0.3)":"none"}}>
                  {exportando?"⏳ Gerando...":"⬇️ Exportar Excel"}
                </button>
              </div>
            </div>
            {registros.length>0&&(
              <>
                {[
                  {titulo:"Por Motivo de Liberação",dados:resumo.porMotivo,cor:G.azul,renderKey:(k)=><MotivoBadge motivo={k}/>},
                  {titulo:"Por Portão / Setor",dados:resumo.porPortao,cor:G.dourado,renderKey:(k)=><span style={{fontSize:12,color:G.azulEscuro,minWidth:130,fontWeight:700}}>{k}</span>},
                  {titulo:"Por Líder Responsável",dados:resumo.porLider,cor:"#4F46E5",renderKey:(k)=><span style={{fontSize:12,color:G.azulEscuro,minWidth:140,fontWeight:700}}>{k}</span>},
                ].map(({titulo,dados,cor,renderKey})=>(
                  <div key={titulo} style={{background:G.branco,borderRadius:12,border:"1.5px solid "+G.cinzaBorda,padding:"16px 18px",marginBottom:12,boxShadow:"0 1px 6px rgba(0,85,165,0.06)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                      <div style={{width:3,height:16,background:cor,borderRadius:2}}/>
                      <span style={{fontSize:12,fontWeight:800,color:G.azulEscuro,textTransform:"uppercase",letterSpacing:0.6}}>{titulo}</span>
                    </div>
                    {Object.entries(dados).sort((a,b)=>b[1]-a[1]).map(([k,qtd])=>(
                      <div key={k} style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
                        <div style={{minWidth:140}}>{renderKey(k)}</div>
                        <div style={{flex:1,height:6,background:G.cinzaClaro,borderRadius:99,overflow:"hidden"}}>
                          <div style={{height:"100%",background:cor,borderRadius:99,width:((qtd/registros.length)*100)+"%",transition:"width 0.6s ease"}}/>
                        </div>
                        <span style={{fontSize:13,fontWeight:900,color:G.azulEscuro,minWidth:22,textAlign:"right"}}>{qtd}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
            {registros.length===0&&(
              <div style={{textAlign:"center",padding:"44px 20px",color:G.cinzaTexto}}>
                <div style={{fontSize:42,marginBottom:10}}>📊</div>
                <div style={{fontWeight:800,fontSize:15,color:G.azulEscuro}}>Nenhum dado para exibir</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
