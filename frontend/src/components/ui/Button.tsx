import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';
export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={cn('btn', className)} />; }
export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={cn('icon-button', className)} />; }
