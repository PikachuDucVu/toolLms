import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`form-input ${props.className || ''}`} />; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`form-input ${props.className || ''}`} />; }
