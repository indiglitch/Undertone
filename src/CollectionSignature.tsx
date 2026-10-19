import type {Track} from './types';
import SignalMark from './SignalMark';
export default function CollectionSignature({kind,tracks}:{kind:string;tracks:Track[]}){
  return <div className={`collection-signature signature-${kind}`} aria-hidden="true"><span className="signature-code">CATALOG / {String(tracks.length).padStart(4,'0')}</span><SignalMark/><span className="signature-side">ЛИЧНЫЙ АРХИВ</span></div>;
}
