import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ConfirmProvider, useConfirm } from './ConfirmDialog';
function Harness(){ const confirm=useConfirm(); const [answer,setAnswer]=useState(''); return <><button onClick={async()=>setAnswer(String(await confirm({title:'Xác nhận',description:'Tiếp tục?'})))}>Mở</button><output>{answer}</output></>; }
describe('confirm dialog',()=>{
  it('supports Escape, ignores backdrop interaction, and restores focus',async()=>{ const user=userEvent.setup(); render(<ConfirmProvider><Harness/></ConfirmProvider>); const trigger=screen.getByRole('button',{name:'Mở'}); await user.click(trigger); expect(screen.getByRole('alertdialog')).toBeInTheDocument(); fireEvent.pointerDown(screen.getByTestId('confirm-backdrop')); expect(screen.getByRole('alertdialog')).toBeInTheDocument(); await user.keyboard('{Escape}'); expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); expect(trigger).toHaveFocus(); expect(screen.getByText('false')).toBeInTheDocument(); });
});
