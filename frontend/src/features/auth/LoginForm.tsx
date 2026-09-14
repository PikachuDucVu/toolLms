import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { LoginRequestSchema } from '@tool-lms/contracts';
import { z } from 'zod';
import { useAuth } from '../../app/providers';
import { Input } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { createOperationController, releaseOperationController } from '../../lib/operationContext';
import { readRememberedLogin, writeRememberedLogin } from '../../lib/persistence';
import { login } from './api';

const FormSchema = LoginRequestSchema.extend({ remember: z.boolean() });
type FormValues = z.infer<typeof FormSchema>;

export function LoginForm({
  onSuccess,
  onPendingChange,
}: {
  onSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const remembered = readRememberedLogin();
  const auth = useAuth();
  const toast = useToast();
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { email: remembered.email, password: remembered.password, remember: true },
  });
  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const controller = createOperationController();
      try {
        return await login(values, controller.signal);
      } finally {
        releaseOperationController(controller);
      }
    },
  });

  useEffect(() => {
    onPendingChange?.(mutation.isPending);
    return () => onPendingChange?.(false);
  }, [mutation.isPending, onPendingChange]);

  const submit = form.handleSubmit(async (values) => {
    try {
      const response = await mutation.mutateAsync(values);
      writeRememberedLogin(values.email, values.password, values.remember);
      await auth.acceptSession({
        email: response.data.email,
        tokenExpiry: response.data.tokenExpiry,
        displayName: response.data.displayName,
      });
      toast.show('Đăng nhập thành công!');
      onSuccess?.();
    } catch (error) {
      toast.show(error instanceof Error ? `Lỗi đăng nhập: ${error.message}` : 'Lỗi đăng nhập', 'error');
    }
  });

  return (
    <form onSubmit={submit} className="login-form" noValidate>
      <label className="form-label" htmlFor="email">Email MindX</label>
      <Input
        id="email"
        type="email"
        autoComplete="email"
        autoFocus
        placeholder="email@mindx.net.vn"
        {...form.register('email')}
      />
      {form.formState.errors.email && <p className="field-error">Email không hợp lệ.</p>}
      <label className="form-label" htmlFor="password">Mật khẩu</label>
      <Input
        id="password"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        {...form.register('password')}
      />
      {form.formState.errors.password && <p className="field-error">Vui lòng nhập mật khẩu.</p>}
      <label className="checkbox-label">
        <input type="checkbox" {...form.register('remember')} />
        Ghi nhớ đăng nhập
      </label>
      <button className="btn btn-primary btn-block" disabled={mutation.isPending}>
        {mutation.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
      </button>
    </form>
  );
}
