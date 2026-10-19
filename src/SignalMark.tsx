export default function SignalMark({variant='orbit'}:{variant?:'orbit'|'tape'|'frequency'}){
  return <svg className={`signal-mark signal-${variant}`} viewBox="0 0 120 80" fill="none" aria-hidden="true">
    {variant==='tape'?<><rect x="9" y="10" width="102" height="60" rx="10"/><path d="M30 58h60l-8-14H38l-8 14Z"/><circle className="signal-reel" cx="36" cy="30" r="11"/><circle className="signal-reel" cx="84" cy="30" r="11"/><path d="M36 24v12m-6-6h12m42-6v12m-6-6h12M47 30h26"/></>:variant==='frequency'?<><path d="M4 40h16l6-17 9 34 9-49 10 64 10-48 10 32 8-23 8 7h26"/><circle className="signal-dot" cx="60" cy="40" r="24"/><path d="M60 0v9m0 62v9M0 40h9m102 0h9"/></>:<><ellipse className="signal-orbit" cx="60" cy="40" rx="51" ry="22" transform="rotate(-18 60 40)"/><ellipse cx="60" cy="40" rx="20" ry="34" transform="rotate(32 60 40)"/><circle cx="60" cy="40" r="10"/><circle className="signal-dot" cx="103" cy="20" r="4" fill="currentColor"/><path d="M54 40h12M60 34v12"/></>}
  </svg>;
}
