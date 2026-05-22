import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Layout from "./components/Layout";
import { useSession } from "./lib/session";

// pages
import LoginGate from "./pages/LoginGate";
import MePage from "./pages/MePage";
import DashboardAdmin from "./pages/DashboardAdmin";
import UserDrilldownPage from "./pages/UserDrilldownPage";
import AuditPage from "./pages/AuditPage";
import SettingsPage from "./pages/SettingsPage";
import CatalogPage from "./pages/CatalogPage";
import MeetingsPage from "./pages/MettingsPage";
import IncidentsPage from "./pages/IncidentsPage";
import RequisitionsPage from "./pages/RequisitionsPage";
import CalendarPage from "./pages/CalendarPage";
import LogAnalyticsPage from "./pages/LogAnalyticsPage";

export default function App() {
  const session = useSession();

  // CSS injection can move to App.css later
  useEffect(() => {
    const css = `
      :root{
        --bg:#070B14;
        --panel:#0B1220;
        --card:#0F1B33;
        --card2:#0D1730;
        --muted:#A9B6CF;
        --text:#EAF0FF;
        --line:rgba(255,255,255,.08);
        --accent:#6EE7FF;
        --accent2:#8B5CF6;
        --danger:#FF5C7A;
        --ok:#39E58C;
        --warn:#FFD166;
      }
      body{
        margin:0;
        background: radial-gradient(1200px 600px at 20% 0%, rgba(110,231,255,.18), transparent 60%),
                    radial-gradient(900px 500px at 85% 10%, rgba(139,92,246,.16), transparent 55%),
                    linear-gradient(180deg, #060913 0%, #070B14 100%);
        color:var(--text);
        font-family: ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;
      }
      .app{display:flex;min-height:100vh}
      .sidebar{
        width:270px;
        background:rgba(11,18,32,.86);
        border-right:1px solid var(--line);
        padding:18px;
        display:flex;flex-direction:column;gap:14px;
        backdrop-filter: blur(10px);
      }
      .brand{display:flex;gap:10px;align-items:center}
      .dot{
        width:14px;height:14px;border-radius:999px;
        background:linear-gradient(135deg,var(--accent),var(--accent2));
        box-shadow:0 0 18px rgba(110,231,255,.35);
      }
      .brandTitle{font-weight:900;letter-spacing:.3px}
      .brandSub{color:var(--muted);font-size:12px;margin-top:2px}
      .nav{display:flex;flex-direction:column;gap:8px;margin-top:8px}
      .navItem{
        padding:10px 12px;border-radius:14px;color:var(--text);
        text-decoration:none;border:1px solid transparent;
        background:transparent;
      }
      .navItem:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.06)}
      .navItem.active{
        background:linear-gradient(180deg, rgba(110,231,255,.12), rgba(139,92,246,.10));
        border-color:rgba(110,231,255,.20);
      }
      .sideFooter{margin-top:auto;padding-top:12px;border-top:1px solid var(--line)}
      .main{flex:1;display:flex;flex-direction:column}
      .topbar{
        height:64px;display:flex;align-items:center;justify-content:space-between;
        padding:0 18px;border-bottom:1px solid var(--line);
        background:rgba(7,11,20,.55);backdrop-filter:blur(10px)
      }
      .topTitle{font-weight:800}
      .content{padding:18px}
      .pageHeader{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px}
      .pageHeaderRight{display:flex;align-items:flex-end;gap:10px}
      .h1{font-size:22px;font-weight:950}
      .muted{color:var(--muted)}
      .small{font-size:12px}
      .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
      .strong{font-weight:800}
      .card{
        background: linear-gradient(180deg, rgba(15,27,51,.85), rgba(13,23,48,.85));
        border:1px solid rgba(255,255,255,.08);
        border-radius:18px;padding:14px;
        box-shadow:0 10px 30px rgba(0,0,0,.28);
      }
      .cardTitle{font-weight:900;margin-bottom:10px}
      .grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .kpi{font-size:28px;font-weight:950;margin-top:6px;letter-spacing:.3px}
      .label{font-size:12px;color:var(--muted);margin-bottom:6px}

      /* inputs */
      .input{
        width:100%;padding:10px 12px;border-radius:14px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(6,10,18,.78);
        color:var(--text);outline:none;
      }
      .input:focus{
        border-color:rgba(110,231,255,.45);
        box-shadow:0 0 0 3px rgba(110,231,255,.12);
      }

      /* visible buttons */
      .btn{
        padding:10px 12px;border-radius:14px;
        border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.07);
        color:var(--text);
        cursor:pointer;font-weight:900;
        transition:transform .08s ease, background .12s ease, border-color .12s ease;
      }
      .btn:hover{background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.20)}
      .btn:active{transform:translateY(1px)}
      .btn:disabled{opacity:.55;cursor:not-allowed}

      .btn.primary{
        border-color:rgba(110,231,255,.38);
        background:linear-gradient(135deg, rgba(110,231,255,.22), rgba(139,92,246,.18));
      }
      .btn.primary:hover{background:linear-gradient(135deg, rgba(110,231,255,.28), rgba(139,92,246,.22))}

      .btn.ghost{
        border-color:rgba(255,255,255,.14);
        background:rgba(255,255,255,.05);
      }

      .btn.danger{
        border-color:rgba(255,92,122,.35);
        background:rgba(255,92,122,.12);
      }

      .btn.small{padding:7px 10px;border-radius:12px}

      .tableWrap{overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:16px}
      .table{width:100%;border-collapse:separate;border-spacing:0}
      .table th,.table td{padding:10px 10px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top}
      .table th{
        font-size:12px;color:var(--muted);text-align:left;
        background:rgba(255,255,255,.04);
        position:sticky;top:0;backdrop-filter:blur(6px)
      }

      .pill{
        display:inline-flex;align-items:center;gap:6px;
        padding:6px 10px;border-radius:999px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.06);
        font-size:12px;font-weight:800;
      }
      .pill.ok{border-color:rgba(57,229,140,.35);background:rgba(57,229,140,.10)}
      .pill.warn{border-color:rgba(255,209,102,.35);background:rgba(255,209,102,.10)}
      .pill.bad{border-color:rgba(255,92,122,.35);background:rgba(255,92,122,.10)}

      .alert{
        padding:12px;border-radius:16px;
        border:1px solid rgba(255,92,122,.30);
        background:rgba(255,92,122,.10);
        margin-bottom:12px;white-space:pre-wrap
      }

      .login{
        min-height:100vh;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:24px;
        background:
          linear-gradient(135deg, rgba(6,10,18,.98), rgba(10,18,32,.96) 46%, rgba(5,12,24,.98)),
          repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 1px, transparent 1px 72px),
          repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 72px);
      }
      .loginCard{
        width:440px;padding:18px;border-radius:20px;
        border:1px solid rgba(255,255,255,.10);
        background:linear-gradient(180deg, rgba(15,27,51,.90), rgba(10,18,32,.85));
        box-shadow:0 14px 44px rgba(0,0,0,.40)
      }
      .premiumLoginCard{
        width:min(460px, 100%);
        padding:28px;
        border-radius:24px;
        border:1px solid rgba(255,255,255,.14);
        background:
          linear-gradient(180deg, rgba(18,29,49,.94), rgba(8,14,26,.92)),
          linear-gradient(135deg, rgba(110,231,255,.09), rgba(139,92,246,.06));
        box-shadow:
          0 30px 90px rgba(0,0,0,.52),
          inset 0 1px 0 rgba(255,255,255,.10);
      }
      .loginMark{display:flex;align-items:center;gap:12px;margin-bottom:24px}
      .loginMarkIcon{
        width:46px;height:46px;border-radius:14px;
        display:flex;align-items:center;justify-content:center;
        color:var(--accent);
        background:rgba(110,231,255,.10);
        border:1px solid rgba(110,231,255,.24);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.10);
      }
      .loginBrand{font-weight:950;font-size:16px}
      .loginCaption{color:var(--muted);font-size:12px;margin-top:2px}
      .loginTitle{font-size:28px;font-weight:950;margin-bottom:6px;line-height:1.1}
      .loginSwitch{
        margin-top:18px;
        padding:4px;
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:4px;
        border-radius:16px;
        background:rgba(255,255,255,.055);
        border:1px solid rgba(255,255,255,.08);
      }
      .loginSwitch button{
        height:42px;
        border:0;
        border-radius:12px;
        background:transparent;
        color:var(--muted);
        font-weight:900;
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:8px;
      }
      .loginSwitch button.active{
        color:var(--text);
        background:linear-gradient(135deg, rgba(110,231,255,.20), rgba(139,92,246,.16));
        box-shadow:0 10px 22px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.12);
      }
      .loginSwitch button:disabled{opacity:.55;cursor:not-allowed}
      .loginField{margin-top:16px}
      .loginInputWrap{
        display:flex;
        align-items:center;
        gap:10px;
        padding:0 12px;
        border-radius:16px;
        border:1px solid rgba(255,255,255,.11);
        background:rgba(4,8,16,.72);
        color:var(--muted);
      }
      .loginInputWrap:focus-within{
        border-color:rgba(110,231,255,.42);
        box-shadow:0 0 0 3px rgba(110,231,255,.10);
        color:var(--accent);
      }
      .loginInput{
        border:0;
        background:transparent;
        padding:12px 0;
        border-radius:0;
        box-shadow:none;
      }
      .loginInput:focus{box-shadow:none;border-color:transparent}
      .loginActions{margin-top:18px}
      .loginSubmit{
        width:100%;
        min-height:46px;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:8px;
      }

      .rowLink{cursor:pointer}
      .rowLink:hover{background:rgba(255,255,255,.04)}
      .link{color:var(--accent);text-decoration:none;font-weight:800}
      .link:hover{text-decoration:underline}

      /* overlay spinner */
      .overlay{
        position:fixed;inset:0;
        background:rgba(0,0,0,.40);
        display:flex;align-items:center;justify-content:center;
        z-index:9999;
        backdrop-filter: blur(4px);
      }
      .overlayCard{
        width:320px;
        padding:16px 14px;
        border-radius:18px;
        border:1px solid rgba(255,255,255,.12);
        background:linear-gradient(180deg, rgba(15,27,51,.92), rgba(10,18,32,.92));
        box-shadow:0 18px 60px rgba(0,0,0,.45);
      }
      .spinnerWrap{display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center}
      .spinner{
        width:34px;height:34px;border-radius:999px;
        border:3px solid rgba(255,255,255,.14);
        border-top-color: rgba(110,231,255,.85);
        animation:spin 0.9s linear infinite;
      }
      .spinnerLabel{color:var(--muted);font-size:12px;font-weight:800}
      @keyframes spin{to{transform:rotate(360deg)}}

      .check{display:flex;gap:8px;align-items:center;color:var(--muted);font-weight:800}

      /* Premium minimal refresh */
      :root{
        --bg:#0B0D10;
        --panel:#101419;
        --card:#151A21;
        --card2:#11161C;
        --muted:#98A2B3;
        --text:#F2F4F7;
        --line:rgba(255,255,255,.09);
        --accent:#4CC9A6;
        --accent2:#7AA7FF;
        --danger:#F97066;
        --ok:#32D583;
        --warn:#FDB022;
      }
      *{box-sizing:border-box}
      body{
        background:
          linear-gradient(180deg, #0B0D10 0%, #0E1116 100%);
        color:var(--text);
        font-size:14px;
        -webkit-font-smoothing:antialiased;
        text-rendering:geometricPrecision;
      }
      .app{background:var(--bg)}
      .sidebar{
        width:286px;
        padding:22px 18px;
        gap:20px;
        background:rgba(16,20,25,.96);
        border-right:1px solid var(--line);
        backdrop-filter:none;
      }
      .brand{gap:12px;padding:2px 4px 16px;border-bottom:1px solid var(--line)}
      .dot{
        width:38px;
        height:38px;
        border-radius:10px;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#07110E;
        background:linear-gradient(135deg, #6EE7C4, #8DB7FF);
        box-shadow:none;
      }
      .brandTitle{font-size:16px;font-weight:900;letter-spacing:0}
      .brandSub{font-size:11px;color:#7D8593;text-transform:uppercase;letter-spacing:.08em}
      .nav{gap:5px;margin-top:0}
      .navItem{
        min-height:42px;
        padding:10px 12px;
        border-radius:8px;
        display:flex;
        align-items:center;
        gap:10px;
        color:#AAB3C2;
        font-weight:750;
        border:1px solid transparent;
        transition:background .16s ease, color .16s ease, border-color .16s ease;
      }
      .navItem:hover{
        color:var(--text);
        background:rgba(255,255,255,.045);
        border-color:rgba(255,255,255,.06);
      }
      .navItem.active{
        color:#F9FAFB;
        background:rgba(76,201,166,.12);
        border-color:rgba(76,201,166,.22);
      }
      .sideFooter{
        margin-top:auto;
        padding:14px;
        border:1px solid var(--line);
        border-radius:8px;
        background:rgba(255,255,255,.025);
      }
      .sessionRole{
        display:inline-flex;
        margin-top:8px;
        padding:4px 8px;
        border-radius:999px;
        border:1px solid rgba(76,201,166,.25);
        background:rgba(76,201,166,.10);
        color:#BFF4E4;
        font-size:11px;
        font-weight:900;
      }
      .logoutBtn{
        margin-top:12px;
        width:100%;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:8px;
      }
      .main{min-width:0;background:#0B0D10}
      .topbar{
        height:72px;
        padding:0 28px;
        background:rgba(11,13,16,.92);
        border-bottom:1px solid var(--line);
        backdrop-filter:blur(12px);
      }
      .topTitle{font-size:15px;font-weight:900}
      .topSubtitle{margin-top:3px;color:var(--muted);font-size:12px}
      .content{
        width:100%;
        max-width:1500px;
        margin:0 auto;
        padding:26px;
      }
      .pageHeader{
        align-items:center;
        margin-bottom:18px;
        padding-bottom:16px;
        border-bottom:1px solid var(--line);
      }
      .pageHeaderRight{gap:8px;flex-wrap:wrap}
      .h1{font-size:24px;font-weight:900;letter-spacing:0;line-height:1.1}
      .muted{color:var(--muted)}
      .small{font-size:12px}
      .strong{font-weight:850}
      .card{
        padding:16px;
        border-radius:8px;
        border:1px solid var(--line);
        background:linear-gradient(180deg, rgba(21,26,33,.98), rgba(17,22,28,.98));
        box-shadow:0 1px 2px rgba(0,0,0,.22), 0 16px 34px rgba(0,0,0,.18);
      }
      .card .card{
        box-shadow:none;
        background:rgba(255,255,255,.025);
      }
      .cardTitle{font-size:13px;font-weight:900;margin-bottom:12px;letter-spacing:.01em}
      .grid4{gap:14px}
      .grid3{gap:14px}
      .grid2{gap:14px}
      .row2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .kpi{font-size:30px;font-weight:900;letter-spacing:0;line-height:1}
      .label{
        font-size:11px;
        font-weight:850;
        color:#A8B0BE;
        text-transform:uppercase;
        letter-spacing:.06em;
      }
      .input{
        min-height:42px;
        padding:10px 12px;
        border-radius:8px;
        border:1px solid rgba(255,255,255,.11);
        background:#0D1117;
        color:var(--text);
        transition:border-color .16s ease, box-shadow .16s ease, background .16s ease;
      }
      .input::placeholder{color:#667085}
      .input:focus{
        border-color:rgba(76,201,166,.50);
        box-shadow:0 0 0 3px rgba(76,201,166,.12);
        background:#0B0F14;
      }
      .btn{
        min-height:40px;
        padding:9px 12px;
        border-radius:8px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        border:1px solid rgba(255,255,255,.11);
        background:#161B22;
        color:#F2F4F7;
        font-weight:850;
        box-shadow:none;
      }
      .btn:hover{
        background:#1B222B;
        border-color:rgba(255,255,255,.18);
      }
      .btn.primary{
        color:#06110E;
        border-color:rgba(76,201,166,.65);
        background:linear-gradient(135deg, #6EE7C4, #8DB7FF);
      }
      .btn.primary:hover{
        background:linear-gradient(135deg, #7EF2D1, #9BC1FF);
      }
      .btn.ghost{
        background:transparent;
        border-color:rgba(255,255,255,.12);
      }
      .btn.danger{
        color:#FFE4E1;
        border-color:rgba(249,112,102,.36);
        background:rgba(249,112,102,.10);
      }
      .btn.small{min-height:32px;padding:6px 9px;border-radius:7px}
      .tableWrap{
        border-radius:8px;
        border:1px solid var(--line);
        background:#0D1117;
        max-width:100%;
      }
      .table{min-width:760px}
      .table th,.table td{
        padding:12px 12px;
        border-bottom:1px solid rgba(255,255,255,.065);
      }
      .table th{
        color:#A8B0BE;
        font-size:11px;
        font-weight:900;
        text-transform:uppercase;
        letter-spacing:.06em;
        background:#11161C;
      }
      .table tbody tr{transition:background .14s ease}
      .table tbody tr:hover{background:rgba(255,255,255,.028)}
      .pill{
        min-height:28px;
        padding:5px 10px;
        border-radius:999px;
        background:rgba(255,255,255,.045);
        border:1px solid rgba(255,255,255,.10);
        font-size:12px;
        font-weight:850;
      }
      .pill.ok{border-color:rgba(50,213,131,.35);background:rgba(50,213,131,.10);color:#B7F7CF}
      .pill.warn{border-color:rgba(253,176,34,.35);background:rgba(253,176,34,.10);color:#FEDF89}
      .pill.bad{border-color:rgba(249,112,102,.35);background:rgba(249,112,102,.10);color:#FECDCA}
      .alert{
        border-radius:8px;
        border-color:rgba(249,112,102,.32);
        background:rgba(249,112,102,.10);
        color:#FECDCA;
      }
      .emptyState{
        min-height:96px;
        display:flex;
        align-items:center;
        justify-content:center;
        text-align:center;
        color:var(--muted);
        border:1px dashed rgba(255,255,255,.12);
        border-radius:8px;
        background:rgba(255,255,255,.02);
      }
      .login{
        background:
          linear-gradient(180deg, rgba(11,13,16,.96), rgba(14,17,22,.98)),
          linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px),
          linear-gradient(0deg, rgba(255,255,255,.026) 1px, transparent 1px);
        background-size:auto, 56px 56px, 56px 56px;
      }
      .premiumLoginCard{
        border-radius:14px;
        border:1px solid rgba(255,255,255,.13);
        background:linear-gradient(180deg, rgba(21,26,33,.98), rgba(17,22,28,.96));
        box-shadow:0 28px 80px rgba(0,0,0,.48);
      }
      .loginMarkIcon{
        border-radius:10px;
        color:#07110E;
        background:linear-gradient(135deg, #6EE7C4, #8DB7FF);
        border:0;
      }
      .loginCaption{text-transform:uppercase;letter-spacing:.08em}
      .loginSwitch{border-radius:10px;background:#0D1117}
      .loginSwitch button{border-radius:8px}
      .loginSwitch button.active{
        color:#06110E;
        background:linear-gradient(135deg, #6EE7C4, #8DB7FF);
        box-shadow:none;
      }
      .loginInputWrap{
        border-radius:8px;
        background:#0D1117;
      }
      .loginInputWrap:focus-within{
        border-color:rgba(76,201,166,.50);
        box-shadow:0 0 0 3px rgba(76,201,166,.12);
        color:var(--accent);
      }
      .loginInput{
        flex:1;
        min-width:0;
        width:auto;
        min-height:42px;
        padding:10px 0;
        border:0;
        border-radius:0;
        background:transparent;
        box-shadow:none;
      }
      .loginInput:focus{
        border:0;
        background:transparent;
        box-shadow:none;
      }
      .input:-webkit-autofill,
      .input:-webkit-autofill:hover,
      .input:-webkit-autofill:focus,
      .loginInput:-webkit-autofill,
      .loginInput:-webkit-autofill:hover,
      .loginInput:-webkit-autofill:focus{
        -webkit-text-fill-color: var(--text);
        caret-color: var(--text);
        transition: background-color 9999s ease-in-out 0s;
        box-shadow: 0 0 0 1000px #0D1117 inset;
      }
      .loginSubmit{min-height:46px}
      .overlay{background:rgba(7,9,12,.58)}
      .overlayCard{
        border-radius:8px;
        background:#151A21;
        box-shadow:0 24px 80px rgba(0,0,0,.40);
      }
      .spinner{border-top-color:var(--accent)}

      @media(max-width:1100px){
        .grid4{grid-template-columns:repeat(2,1fr)}
        .grid3{grid-template-columns:1fr}
        .grid2{grid-template-columns:1fr}
        .row2{grid-template-columns:1fr}
        .sidebar{display:none}
      }
      @media(max-width:760px){
        .content{padding:16px}
        .topbar{height:auto;min-height:64px;padding:14px 16px;align-items:flex-start;gap:10px}
        .topRight{display:none}
        .pageHeader{align-items:flex-start;flex-direction:column}
        .pageHeaderRight{width:100%;align-items:stretch}
        .pageHeaderRight > *{flex:1 1 160px}
        .pageHeaderRight .btn{width:100%}
        .grid4{grid-template-columns:1fr}
        .kpi{font-size:26px}
        .card{padding:14px}
      }
    `;
    const tag = document.createElement("style");
    tag.innerHTML = css;
    document.head.appendChild(tag);
    return () => {
      if (tag.parentNode) tag.parentNode.removeChild(tag);
    };
  }, []);

  if (!session.uniqueName || !session.token) return <LoginGate setSession={session.setSession} />;

  return (
    <BrowserRouter>
      <Layout session={session} onLogout={session.logout}>
        <Routes>
          <Route path="/" element={<Navigate to={session.role === "admin" ? "/dashboard" : "/me"} replace />} />
          <Route path="/dashboard" element={session.role === "admin" ? <DashboardAdmin session={session} /> : <Navigate to="/me" replace />} />
          <Route path="/audit" element={session.role === "admin" ? <AuditPage session={session} /> : <Navigate to="/me" replace />} />
          <Route path="/user/:uniqueName" element={session.role === "admin" ? <UserDrilldownPage session={session} /> : <Navigate to="/me" replace />} />
          <Route path="/settings" element={session.role === "admin" ? <SettingsPage session={session} /> : <Navigate to="/me" replace />} />
          <Route path="/catalog" element={<CatalogPage session={session} />} />
          <Route path="/calendar" element={<CalendarPage session={session} />} />
          <Route path="/log-analytics" element={<LogAnalyticsPage session={session} />} />
          <Route path="/me" element={<MePage session={session} />} />
          <Route path="/meetings" element={session.role === "admin" ? <MeetingsPage session={session} /> : <Navigate to="/me" replace />} />
          <Route
            path="/incidents"
            element={<IncidentsPage session={session} />}
          />
          <Route
            path="/requisitions"
            element={<RequisitionsPage session={session} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
