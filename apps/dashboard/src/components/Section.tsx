import type { ReactNode } from 'react';

/** A deep-linkable page section. The id carries `scroll-margin-top` in CSS so
 * submenu navigation lands below the opaque header, not tucked under it. */
export function Section({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={`sec-${id}`} className={className ? `section ${className}` : 'section'}>
      {children}
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="section-head">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {lead ? <p className="lead">{lead}</p> : null}
    </div>
  );
}
