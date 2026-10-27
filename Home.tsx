import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  ExternalLink,
  Headphones,
  Link2,
  Maximize2,
  MoreHorizontal,
  MonitorUp,
  Radio,
  ScanLine,
  ScreenShare,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";

type AvatarId = "violet" | "sunset" | "mint" | "sky" | "coral";
type Mode = "create" | "join";
type RoomState = "landing" | "room";

type Avatar = {
  id: AvatarId;
  label: string;
  initials: string;
  color: string;
};

type RemoteParticipant = {
  id: string;
  nickname: string;
  avatar: AvatarId;
  streaming: boolean;
  stream: MediaStream | null;
};

const avatars: Avatar[] = [
  { id: "violet", label: "Roxo", initials: "TF", color: "avatar-violet" },
  { id: "sunset", label: "Pôr do sol", initials: "LU", color: "avatar-sunset" },
  { id: "mint", label: "Menta", initials: "NO", color: "avatar-mint" },
  { id: "sky", label: "Céu", initials: "CA", color: "avatar-sky" },
  { id: "coral", label: "Coral", initials: "RA", color: "avatar-coral" },
];

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function AvatarBadge({ avatar, size = "md" }: { avatar: Avatar; size?: "sm" | "md" | "lg" }) {
  return <span className={`avatar-badge ${avatar.color} avatar-${size}`}>{avatar.initials}</span>;
}

function VyrAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return <span className={`avatar-badge avatar-logo-badge avatar-${size}`}><img src="/assets/vyr-development-logo.png" alt="Logo VYR" /></span>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`} aria-label="Tela VYR">
      <img className="brand-logo" src="/assets/vyr-development-logo.png" alt="VYR Development" />
      <span className="brand-name">Tela <span>VYR</span></span>
      {!compact && <span className="brand-caption">ponto a ponto</span>}
    </div>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <div className="section-eyebrow"><span className="eyebrow-dot" />{children}</div>;
}

export default function Home() {
  const initialRoom = useMemo(() => new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "", []);
  const [roomState, setRoomState] = useState<RoomState>("landing");
  const [mode, setMode] = useState<Mode>(initialRoom ? "join" : "create");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState(initialRoom.replace(/[^A-Z0-9]/g, "").slice(0, 6));
  const [activeRoom, setActiveRoom] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarId>("violet");
  const [isSharing, setIsSharing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const clientIdRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);

  const currentAvatar = avatars.find((avatar) => avatar.id === selectedAvatar) ?? avatars[0];
  const normalizedNickname = nickname.trim();

  function avatarId(value: string): AvatarId {
    return avatars.some((avatar) => avatar.id === value) ? value as AvatarId : "violet";
  }

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    streamRef.current = stream;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "streaming", streaming: Boolean(stream) }));
    }

    const tracksByKind = {
      video: stream?.getVideoTracks()[0] ?? null,
      audio: stream?.getAudioTracks()[0] ?? null,
    };
    peersRef.current.forEach((peer) => {
      let addedTrack = false;
      (Object.entries(tracksByKind) as Array<["video" | "audio", MediaStreamTrack | null]>).forEach(([kind, track]) => {
        const sender = peer.getSenders().find((item) => item.track?.kind === kind || (item as RTCRtpSender & { kind?: string }).kind === kind);
        if (sender) {
          void sender.replaceTrack(track);
        } else if (track && stream) {
          peer.addTrack(track, stream);
          addedTrack = true;
        }
      });
      if (addedTrack) {
        void peer.createOffer().then(async (offer) => {
          await peer.setLocalDescription(offer);
          const target = [...peersRef.current.entries()].find(([, value]) => value === peer)?.[0];
          if (target && socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "signal", to: target, data: { sdp: peer.localDescription } }));
          }
        });
      }
    });
  }, [stream]);

  useEffect(() => {
    if (roomState !== "room" || !activeRoom || !normalizedNickname) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/signaling?room=${activeRoom}&nickname=${encodeURIComponent(normalizedNickname)}&avatar=${selectedAvatar}`);
    socketRef.current = socket;

    const toRemoteParticipant = (participant: { id: string; nickname: string; avatar: string; streaming: boolean }): RemoteParticipant => ({
      ...participant,
      avatar: avatarId(participant.avatar),
      stream: null,
    });
    const pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
    const sendSignal = (to: string, data: unknown) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "signal", to, data }));
    };
    const closePeer = (id: string) => {
      peersRef.current.get(id)?.close();
      peersRef.current.delete(id);
      pendingCandidates.delete(id);
    };
    const makePeer = (participant: RemoteParticipant, shouldOffer: boolean) => {
      const existingPeer = peersRef.current.get(participant.id);
      if (existingPeer) return existingPeer;
      const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peersRef.current.set(participant.id, peer);
      const currentStream = streamRef.current;
      currentStream?.getTracks().forEach((track) => peer.addTrack(track, currentStream));
      peer.onicecandidate = (event) => {
        if (event.candidate) sendSignal(participant.id, { candidate: event.candidate });
      };
      peer.ontrack = (event) => {
        const incomingStream = event.streams[0] ?? new MediaStream([event.track]);
        setRemoteParticipants((items) => items.map((item) => item.id === participant.id ? { ...item, stream: incomingStream, streaming: true } : item));
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(peer.connectionState)) closePeer(participant.id);
      };
      if (shouldOffer) {
        void peer.createOffer().then(async (offer) => {
          await peer.setLocalDescription(offer);
          sendSignal(participant.id, { sdp: peer.localDescription });
        });
      }
      return peer;
    };

    socket.onmessage = (event) => {
      void (async () => {
        const message = JSON.parse(event.data as string) as { type: string; clientId?: string; participants?: Array<{ id: string; nickname: string; avatar: string; streaming: boolean }>; participant?: { id: string; nickname: string; avatar: string; streaming: boolean }; id?: string; from?: string; data?: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } };
        if (message.type === "welcome" && message.clientId && message.participants) {
          clientIdRef.current = message.clientId;
          const participants = message.participants.map(toRemoteParticipant);
          setRemoteParticipants(participants);
          participants.forEach((participant) => {
            if (message.clientId && message.clientId < participant.id && !participant.streaming) makePeer(participant, true);
          });
        }
        if (message.type === "participant-joined" && message.participant) {
          const participant = toRemoteParticipant(message.participant);
          setRemoteParticipants((items) => items.some((item) => item.id === participant.id) ? items : [...items, participant]);
          if (clientIdRef.current < participant.id || (Boolean(streamRef.current) && clientIdRef.current > participant.id)) makePeer(participant, true);
        }
        if (message.type === "participant-updated" && message.participant) {
          setRemoteParticipants((items) => items.map((item) => item.id === message.participant?.id ? { ...item, streaming: Boolean(message.participant.streaming) } : item));
        }
        if (message.type === "participant-left" && message.id) {
          closePeer(message.id);
          setRemoteParticipants((items) => items.filter((item) => item.id !== message.id));
        }
        if (message.type === "signal" && message.from && message.data) {
          const participant = remoteParticipants.find((item) => item.id === message.from) ?? { id: message.from, nickname: "Visitante", avatar: "violet" as AvatarId, streaming: false, stream: null };
          const peer = makePeer(participant, false);
          if (message.data.sdp) {
            await peer.setRemoteDescription(message.data.sdp);
            const queuedCandidates = pendingCandidates.get(message.from) ?? [];
            for (const candidate of queuedCandidates) await peer.addIceCandidate(candidate);
            pendingCandidates.delete(message.from);
            if (message.data.sdp.type === "offer") {
              const answer = await peer.createAnswer();
              await peer.setLocalDescription(answer);
              sendSignal(message.from, { sdp: peer.localDescription });
            }
          }
          if (message.data.candidate) {
            if (peer.remoteDescription) {
              await peer.addIceCandidate(message.data.candidate);
            } else {
              const queuedCandidates = pendingCandidates.get(message.from) ?? [];
              queuedCandidates.push(message.data.candidate);
              pendingCandidates.set(message.from, queuedCandidates);
            }
          }
        }
      })().catch(() => toast.error("A conexão da sala encontrou um problema", { description: "Tente atualizar a página para reconectar." }));
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "leave" }));
      socket.close();
      peersRef.current.forEach((peer) => peer.close());
      peersRef.current.clear();
      socketRef.current = null;
      clientIdRef.current = "";
      setRemoteParticipants([]);
    };
  }, [activeRoom, normalizedNickname, roomState, selectedAvatar]);

  useEffect(() => {
    if (!stream) return;
    const [videoTrack] = stream.getVideoTracks();
    if (!videoTrack) return;
    const stopFromBrowser = () => {
      setIsSharing(false);
      setStream(null);
      toast("Compartilhamento encerrado", { description: "Você parou de transmitir sua tela." });
    };
    videoTrack.addEventListener("ended", stopFromBrowser);
    return () => videoTrack.removeEventListener("ended", stopFromBrowser);
  }, [stream]);

  useEffect(() => {
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [stream]);

  function enterRoom() {
    setError("");
    if (!normalizedNickname) {
      setError("Escolha um nickname para entrar na sala.");
      return;
    }
    if (normalizedNickname.length > 24) {
      setError("Seu nickname pode ter até 24 caracteres.");
      return;
    }
    if (mode === "join" && roomCode.replace(/\s/g, "").length !== 6) {
      setError("Digite um código de sala com 6 caracteres.");
      return;
    }
    const nextRoom = mode === "create" ? makeRoomCode() : roomCode.replace(/\s/g, "").toUpperCase();
    setActiveRoom(nextRoom);
    setRoomCode(nextRoom);
    setRoomState("room");
    window.history.replaceState({}, "", `?room=${nextRoom}`);
    toast(mode === "create" ? "Sala criada" : "Você entrou na sala", {
      description: `Código ${nextRoom} pronto para compartilhar.`,
    });
  }

  function leaveRoom() {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setIsSharing(false);
    setRoomState("landing");
    setActiveRoom("");
    window.history.replaceState({}, "", window.location.pathname);
  }

  async function toggleScreenShare() {
    if (isSharing) {
      stream?.getTracks().forEach((track) => track.stop());
      setStream(null);
      setIsSharing(false);
      toast("Transmissão pausada", { description: "Sua tela deixou de aparecer na sala." });
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Seu navegador não suporta compartilhamento de tela.", {
        description: "Tente usar a versão mais recente do Chrome, Edge ou Firefox.",
      });
      return;
    }
    try {
      const nextStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      setStream(nextStream);
      setIsSharing(true);
      toast.success("Você está transmitindo", { description: "Se disponível, o áudio da aba também será compartilhado." });
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "NotAllowedError") {
        toast("Compartilhamento cancelado", { description: "Nenhuma tela foi compartilhada." });
      } else {
        toast.error("Não foi possível compartilhar a tela", { description: "Tente novamente em alguns segundos." });
      }
    }
  }

  async function copyInvite() {
    const invite = `${window.location.origin}${window.location.pathname}?room=${activeRoom}`;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      toast.success("Convite copiado", { description: "É só enviar o link para quem vai entrar." });
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error("Não foi possível copiar o convite");
    }
  }

  if (roomState === "room") {
    return (
      <RoomView
        activeRoom={activeRoom}
        avatar={currentAvatar}
        nickname={normalizedNickname}
        isSharing={isSharing}
        stream={stream}
        remoteParticipants={remoteParticipants}
        videoRef={videoRef}
        copied={copied}
        onCopy={copyInvite}
        onShare={toggleScreenShare}
        onLeave={leaveRoom}
      />
    );
  }

  return (
    <main className="app-shell landing-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="site-header page-width">
        <Brand />
        <nav className="top-nav" aria-label="Navegação principal">
          <a href="#como-funciona">Como funciona</a>
          <button type="button" onClick={() => setShowFaq((value) => !value)} aria-expanded={showFaq}>Dúvidas <ChevronDown size={14} /></button>
          <a href="https://discord.gg/zyn6f8PHzX" target="_blank" rel="noreferrer">Discord <ExternalLink size={14} /></a>
          <span className="privacy-pill"><ShieldCheck size={13} /> sem cadastro</span>
        </nav>
      </header>

      <section className="hero page-width">
        <img className="hero-vyr-decoration" src="/assets/vyr-development.png" alt="" aria-hidden="true" />
        <div className="hero-copy">
          <div className="hero-credit">Feito com <span>❤</span> por Vgzin</div>
          <SectionEyebrow>compartilhe sem atravessar o mundo</SectionEyebrow>
          <h1>Sua tela, <em>ao vivo</em>, direto para a sala.</h1>
          <p className="hero-description">Crie uma sala em um clique, mande o código e transmita pelo navegador. Sem instalar nada, sem cadastro.</p>
          <div className="hero-proof"><span className="proof-avatars"><AvatarBadge avatar={avatars[1]} size="sm" /><AvatarBadge avatar={avatars[2]} size="sm" /><AvatarBadge avatar={avatars[3]} size="sm" /></span><span><strong>ponto a ponto</strong><br />a tela viaja de navegador para navegador</span></div>
        </div>
        <div className="room-card-wrap">
          <div className="room-card-glow" />
          <div className="room-card">
            <div className="card-topline"><span className="live-indicator"><span /> ao vivo</span><span className="card-topnote">leva menos de 30s</span></div>
            <div className="mode-switch" role="tablist" aria-label="Ação da sala">
              <button type="button" role="tab" aria-selected={mode === "create"} className={mode === "create" ? "active" : ""} onClick={() => { setMode("create"); setError(""); }}>Criar sala</button>
              <button type="button" role="tab" aria-selected={mode === "join"} className={mode === "join" ? "active" : ""} onClick={() => { setMode("join"); setError(""); }}>Entrar com código</button>
            </div>
            <div className="card-heading"><h2>{mode === "create" ? "Abra uma sala" : "Entre na sala"}</h2><p>{mode === "create" ? "Você recebe um código único para compartilhar." : "Cole o código que alguém enviou para você."}</p></div>
            <label className="field-label" htmlFor="nickname">Como você quer aparecer?</label>
            <div className="nickname-row"><div className="input-with-icon"><Users size={17} /><input id="nickname" value={nickname} maxLength={24} onChange={(event) => { setNickname(event.target.value); setError(""); }} placeholder="seu nickname" /><span>{nickname.length}/24</span></div></div>
            <div className="avatar-picker"><span className="field-label">Avatar da sala</span><div className="avatar-options" role="radiogroup" aria-label="Avatar da sala"><button type="button" className="selected" onClick={() => setSelectedAvatar("violet")} aria-label="Logo VYR" aria-pressed="true"><VyrAvatar size="sm" /><span className="avatar-check"><Check size={10} /></span></button></div></div>
            {mode === "join" && <div className="join-code-field"><label className="field-label" htmlFor="room-code">Código da sala</label><div className="code-input"><Link2 size={17} /><input id="room-code" value={roomCode} maxLength={6} onChange={(event) => { setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }} placeholder="ex.: 7K4M2Q" /></div></div>}
            {error && <div className="form-error" role="alert"><CircleHelp size={15} />{error}</div>}
            <button type="button" className="primary-action" onClick={enterRoom}>{mode === "create" ? "Criar minha sala" : "Entrar agora"}<ArrowRight size={18} /></button>
            <p className="secure-note"><ShieldCheck size={14} /> nenhuma tela é armazenada</p>
          </div>
        </div>
      </section>

      <section className="feature-strip page-width" id="como-funciona">
        <div className="feature-intro"><span className="mini-kicker">feito para ir direto ao ponto</span><h2>Menos configuração.<br /><span>Mais presença.</span></h2></div>
        <div className="feature-list">
          <Feature icon={<ScanLine />} number="01" title="Abriu, entrou" text="Funciona direto no navegador. Sem download, sem conta, sem distração." />
          <Feature icon={<Wifi />} number="02" title="Ponto a ponto" text="O vídeo vai de uma pessoa à outra, sem passar pelo nosso servidor." />
          <Feature icon={<Radio />} number="03" title="Todo mundo junto" text="Compartilhe várias telas na mesma sala e acompanhe em uma só visão." />
        </div>
      </section>

      <footer className="site-footer page-width"><Brand compact /><div className="footer-center"><span className="footer-status"><span /> serviço operacional</span><span>feito para encontros que não podem esperar</span></div></footer>
      {showFaq && <div className="faq-popover"><div className="faq-header"><span>Uma dúvida rápida</span><button type="button" onClick={() => setShowFaq(false)} aria-label="Fechar dúvidas"><X size={16} /></button></div><p>O Tela VYR usa o navegador para capturar sua tela. Quando você para de transmitir, a captura termina na hora.</p></div>}
    </main>
  );
}

function Feature({ icon, number, title, text }: { icon: ReactNode; number: string; title: string; text: string }) {
  return <article className="feature-item"><div className="feature-icon">{icon}</div><div className="feature-number">{number}</div><h3>{title}</h3><p>{text}</p></article>;
}

function RemoteVideoTile({ participant }: { participant: RemoteParticipant }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) videoRef.current.srcObject = participant.stream;
  }, [participant.stream]);

  return <div className="video-tile"><video ref={videoRef} autoPlay playsInline /><div className="video-label"><VyrAvatar size="sm" /><span>{participant.nickname}</span><span className="video-live">AO VIVO</span></div></div>;
}

function RoomView({ activeRoom, avatar, nickname, isSharing, stream, remoteParticipants, videoRef, copied, onCopy, onShare, onLeave }: { activeRoom: string; avatar: Avatar; nickname: string; isSharing: boolean; stream: MediaStream | null; remoteParticipants: RemoteParticipant[]; videoRef: RefObject<HTMLVideoElement | null>; copied: boolean; onCopy: () => void; onShare: () => void; onLeave: () => void }) {
  const activeRemotes = remoteParticipants.filter((participant) => participant.stream);
  const participantCount = remoteParticipants.length + 1;
  const activeVideoCount = (isSharing && stream ? 1 : 0) + activeRemotes.length;
  const hasVideo = Boolean(stream && isSharing) || activeRemotes.length > 0;
  const stageLabel = isSharing ? "transmitindo agora" : activeRemotes.length > 0 ? `${activeRemotes.length} tela${activeRemotes.length > 1 ? "s" : ""} ao vivo` : "sua tela";
  const stageRef = useRef<HTMLElement>(null);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      toast.error("Não foi possível abrir a tela cheia", { description: "Seu navegador pode bloquear esse recurso no preview." });
    }
  }
  return <main className="app-shell room-shell"><div className="room-grid-bg" /><header className="room-header page-width"><Brand compact /><div className="room-header-center"><span className="room-live-dot" /> sala ao vivo <span className="room-divider">/</span> <strong>{activeRoom}</strong></div><div className="room-actions"><button type="button" className="ghost-button" onClick={onCopy}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "copiado" : "copiar convite"}</button><button type="button" className="icon-button" aria-label="Mais opções"><MoreHorizontal size={20} /></button></div></header><section className="room-content page-width"><div className="room-title-row"><div><span className="section-eyebrow"><span className="eyebrow-dot" />sala {activeRoom}</span><h1>Compartilhe quando estiver pronto.</h1><p>Convide alguém para começar a ver sua tela em tempo real.</p></div><div className="room-title-meta"><span><Users size={15} /> {participantCount} participante{participantCount > 1 ? "s" : ""}</span><span><ShieldCheck size={15} /> conexão privada</span></div></div><div className="room-layout"><section ref={stageRef} className={`stage-card ${hasVideo ? "is-sharing" : ""}`}><div className="stage-toolbar"><span className="stage-label"><span className="stage-live-dot" /> {stageLabel}</span><div className="stage-toolbar-actions"><button type="button" className="stage-fullscreen" onClick={toggleFullscreen} aria-label="Alternar tela cheia" title="Tela cheia"><Maximize2 size={17} /></button><button type="button" className="stage-more" aria-label="Mais opções"><MoreHorizontal size={18} /></button></div></div>{hasVideo ? <div className={`video-grid video-grid-${Math.min(Math.max(activeVideoCount, 1), 4)}`}>{isSharing && stream && <div className="video-tile"><video ref={videoRef} autoPlay muted playsInline /><div className="video-label"><VyrAvatar size="sm" /><span>{nickname} <small>você</small></span><span className="video-live">AO VIVO</span></div></div>}{activeRemotes.map((participant) => <RemoteVideoTile key={participant.id} participant={participant} />)}</div> : <div className="empty-stage"><div className="empty-stage-orb"><MonitorUp size={42} strokeWidth={1.4} /></div><h2>Nenhuma tela compartilhada</h2><p>Clique no botão abaixo para escolher uma janela, aba ou tela inteira.</p><button type="button" className="share-button" onClick={onShare}><ScreenShare size={18} /> compartilhar minha tela</button></div>}<div className="stage-footer"><div className="stage-user"><VyrAvatar size="sm" /><span>{nickname}<small> você</small></span></div><button type="button" className={`stage-control ${isSharing ? "stop" : ""}`} onClick={onShare}>{isSharing ? <><span className="stop-square" /> parar transmissão</> : <><ScreenShare size={16} /> compartilhar tela</>}</button></div></section><aside className="participants-panel"><div className="panel-heading"><div><span className="panel-kicker">nesta sala</span><h2>Participantes <span>{String(participantCount).padStart(2, "0")}</span></h2></div><button type="button" className="panel-help" aria-label="Ajuda"><CircleHelp size={17} /></button></div><div className="participant-list"><div className="participant-row"><VyrAvatar size="md" /><div className="participant-copy"><strong>{nickname}</strong><span>{isSharing ? "transmitindo tela" : "pronto para compartilhar"}</span></div><span className={`participant-status ${isSharing ? "live" : "ready"}`}><span />{isSharing ? "ao vivo" : "pronto"}</span></div>{remoteParticipants.map((participant) => { return <div className="participant-row" key={participant.id}><VyrAvatar size="md" /><div className="participant-copy"><strong>{participant.nickname}</strong><span>{participant.streaming ? "transmitindo tela" : "pronto para compartilhar"}</span></div><span className={`participant-status ${participant.streaming ? "live" : "ready"}`}><span />{participant.streaming ? "ao vivo" : "pronto"}</span></div>; })}<div className="invite-card"><div className="invite-icon"><Sparkles size={16} /></div><div><strong>Traga alguém para a sala</strong><p>Compartilhe o código <b>{activeRoom}</b> com seu grupo.</p></div><button type="button" onClick={onCopy} aria-label="Copiar código"><Copy size={16} /></button></div></div><div className="panel-bottom"><div className="connection-line"><span className="connection-icon"><Wifi size={15} /></span><div><span>conexão</span><strong>excelente</strong></div><span className="connection-bars"><i /><i /><i /><i /></span></div><button type="button" className="leave-button" onClick={onLeave}>sair da sala</button></div></aside></div><div className="room-note"><Headphones size={15} /> Dica: selecione uma aba do navegador e marque “compartilhar áudio” para transmitir o som junto com a tela.</div></section></main>;
}
