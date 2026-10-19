import type { ReactNode } from 'react';

export default function PageHeader({icon,title,subtitle,actions,children,eyebrow,actionsPlacement='aside',className=''}:{icon:ReactNode;title:string;subtitle?:ReactNode;actions?:ReactNode;children?:ReactNode;eyebrow?:string;actionsPlacement?:'aside'|'inline';className?:string}){
  return <header className={`page-header ${className}`}>
    <span className="page-header-icon" aria-hidden="true">{icon}</span>
    <div className="page-header-copy">{eyebrow&&<span className="entity-eyebrow">{eyebrow}</span>}<h1 className="ds-text-page-title" title={title}>{title}</h1>{subtitle&&<p className="ds-text-secondary">{subtitle}</p>}{children}{actions&&actionsPlacement==='inline'&&<div className="page-header-actions">{actions}</div>}</div>
    {actions&&actionsPlacement==='aside'&&<div className="page-header-actions">{actions}</div>}
  </header>;
}
