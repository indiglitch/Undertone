import {useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref} from 'react';
import {Search, X} from 'lucide-react';

type Size = 'sm' | 'md' | 'lg';
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'; size?: Size; ref?: Ref<HTMLButtonElement>;busy?:boolean;busyLabel?:ReactNode};
export function Button({variant='secondary',size='md',type='button',className='',busy=false,busyLabel,children,...props}:ButtonProps){
  return <button {...props} disabled={props.disabled||busy} aria-busy={busy||undefined} type={type} className={`ds-button ds-button--${variant} ds-control--${size} ${busyLabel?'ds-pending-button':''} ${className}`}>{busyLabel?<><span className="ds-pending-label" aria-hidden={busy||undefined} style={{visibility:busy?'hidden':'visible'}}>{children}</span><span className="ds-pending-label" aria-hidden={!busy||undefined} style={{visibility:busy?'visible':'hidden'}}>{busyLabel}</span></>:children}</button>;
}
export function IconButton({size='md',className='',...props}:Omit<ButtonProps,'variant'> & {'aria-label':string}){
  return <Button {...props} variant="ghost" size={size} className={`ds-icon-button ${className}`}/>;
}
type InputProps = InputHTMLAttributes<HTMLInputElement> & {controlSize?:Size; ref?:Ref<HTMLInputElement>};
export function Input({controlSize='md',className='',...props}:InputProps){
  return <input {...props} className={`ds-input ds-control--${controlSize} ${className}`}/>;
}
export function SearchInput({onClear,children,className='',controlSize='md',...props}:InputProps & {'aria-label':string;onClear?:()=>void;children?:ReactNode}){
  return <div className={`ds-search ds-control--${controlSize} ${className}`}><Search aria-hidden="true"/><Input {...props} controlSize={controlSize}/>{onClear&&props.value!=null&&String(props.value).length>0&&<IconButton aria-label="Очистить поиск" disabled={props.disabled} onClick={onClear}><X aria-hidden="true"/></IconButton>}{children}</div>;
}
export type TabItem<T extends string>={value:T;label:ReactNode;disabled?:boolean;id?:string;panelId:string};
export function Tabs<T extends string>({items,value,onValueChange,label,className=''}:{items:readonly TabItem<T>[];value:T;onValueChange:(value:T)=>void;label:string;className?:string}){
  const id=useId();
  return <div role="tablist" aria-label={label} className={`ds-tabs ${className}`}>{items.map(item=><button key={item.value} type="button" role="tab" id={item.id??`${id}-${item.value}`} aria-selected={value===item.value} aria-controls={item.panelId} disabled={item.disabled} tabIndex={value===item.value?0:-1} onClick={()=>onValueChange(item.value)} onKeyDown={event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const enabled=items.filter(tab=>!tab.disabled);if(!enabled.length)return;
    const index=enabled.findIndex(tab=>tab.value===item.value);
    const next=event.key==='Home'?enabled[0]:event.key==='End'?enabled[enabled.length-1]:enabled[(index+(event.key==='ArrowRight'?1:-1)+enabled.length)%enabled.length];
    event.preventDefault();onValueChange(next.value);
    const buttons=event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]');buttons?.[items.indexOf(next)]?.focus();
  }}>{item.label}</button>)}</div>;
}
export function Divider({orientation='horizontal',className=''}:{orientation?:'horizontal'|'vertical';className?:string}){
  return <div role="separator" aria-orientation={orientation} className={`ds-divider ds-divider--${orientation} ${className}`}/>;
}
