import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const RegisterPage = ({ onViewChange }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    // 邮箱验证码注册相关
    const [studentId, setStudentId] = useState('');
    const [code, setCode] = useState('');
    const [method, setMethod] = useState('email'); // 'email' | 'classic'
    const [cooldown, setCooldown] = useState(0); // 秒
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { register, requestEmailCode, verifyEmailRegister } = useAuth();

    const studentIdHelp = '学号格式：U/M/I/Dyyyyxxxxx，例如 U202312345（xxxxx 范围 10001-99999）';
    const isValidStudentId = useMemo(() => (value) => {
        const m = String(value || '').trim().match(/^[UMIDumid](20\d{2})(\d{5})$/);
        if (!m) return false;
        const serial = Number(m[2]);
        return serial >= 10001 && serial <= 99999;
    }, []);

    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
        return () => clearInterval(t);
    }, [cooldown]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (password !== confirmPassword) {
            setError('两次输入的密码不一致');
            return;
        }
        if (password.length < 6) {
            setError('密码长度不能少于6位');
            return;
        }

        setIsLoading(true);
        try {
            if (method === 'email') {
                if (!isValidStudentId(studentId)) {
                    setError('学号格式不合法。' + ' ' + studentIdHelp);
                    return;
                }
                if (!/^\d{6}$/.test(code)) {
                    setError('验证码为 6 位数字。');
                    return;
                }
                const finalUsername = username?.trim() ? username.trim() : studentId.toLowerCase();
                await verifyEmailRegister({ studentId: studentId.trim(), code: code.trim(), username: finalUsername, password });
                setSuccess('注册成功，已自动登录。');
            } else {
                await register(username, password);
                setSuccess('注册成功！现在你可以去登录了。');
            }
            setUsername('');
            setPassword('');
            setConfirmPassword('');
            setCode('');
        } catch (err) {
            setError(err?.response?.data?.message || '注册失败，请稍后再试。');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendCode = async () => {
        setError('');
        setSuccess('');
        if (!isValidStudentId(studentId)) {
            setError('学号格式不合法。' + ' ' + studentIdHelp);
            return;
        }
        if (cooldown > 0) return;
        try {
            await requestEmailCode(studentId.trim());
            setSuccess('验证码已发送至 ' + studentId.trim() + '@hust.edu.cn，请在 10 分钟内查收。');
            setCooldown(60);
        } catch (err) {
            setError(err?.response?.data?.message || '发送失败，请稍后再试。');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
                <h1 className="text-3xl font-bold text-center text-gray-900">注册喻园易站</h1>

                <div className="flex gap-2 justify-center">
                    <button
                        type="button"
                        onClick={() => setMethod('email')}
                        className={`px-3 py-1.5 rounded-md text-sm ${method==='email' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-800'}`}
                    >邮箱验证码注册</button>
                    <button
                        type="button"
                        onClick={() => setMethod('classic')}
                        className={`px-3 py-1.5 rounded-md text-sm ${method==='classic' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-800'}`}
                    >普通注册</button>
                </div>
                
                {error && <p className="text-center text-red-500 bg-red-100 p-3 rounded-md">{error}</p>}
                {success && <p className="text-center text-green-500 bg-green-100 p-3 rounded-md">{success}</p>}

                <form className="space-y-6" onSubmit={handleSubmit}>
                    {method === 'email' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">学号（首字母可为 U/M/I/D）</label>
                                <input
                                    type="text"
                                    value={studentId}
                                    onChange={(e) => setStudentId(e.target.value)}
                                    placeholder="例如 U202312345"
                                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <p className="mt-1 text-xs text-gray-500">{studentIdHelp}</p>
                            </div>
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700">验证码</label>
                                    <input
                                        type="text"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value)}
                                        placeholder="6 位数字"
                                        className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSendCode}
                                    disabled={cooldown>0}
                                    className="h-10 px-3 text-sm text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-300"
                                >{cooldown>0 ? `${cooldown}s 后重试` : '发送验证码'}</button>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">用户名（可选）</label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="不填则默认使用学号小写"
                                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                        </>
                    )}

                    {method === 'classic' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700">用户名</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">密码</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">确认密码</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
                        >
                            {isLoading ? '注册中...' : (method==='email' ? '验证并注册' : '注册')}
                        </button>
                    </div>
                </form>

                <p className="text-sm text-center text-gray-600">
                    已经有账户了？{' '}
                    <button onClick={() => onViewChange('login')} className="font-medium text-indigo-600 hover:text-indigo-500">
                        直接登录
                    </button>
                </p>
            </div>
        </div>
    );
};

export default RegisterPage;