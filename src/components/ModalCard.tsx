import React from 'react'

export function ModalCard(props: {
  category: string
  title: string
  children: React.ReactNode
  onClose?: () => void
}) {
  return (
    <div className="cm_overlay">
      <div className="cm_card">
        <div className="cm_ribbon">
          <div className="cm_category">{props.category}</div>
          {props.onClose ? (
            <button className="cm_x" onClick={props.onClose} aria-label="Close">
              ×
            </button>
          ) : null}
        </div>
        <div className="cm_title">{props.title}</div>
        <div className="cm_body">{props.children}</div>
      </div>
    </div>
  )
}
