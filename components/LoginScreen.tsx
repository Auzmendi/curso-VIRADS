import React, { useState } from 'react';
import type { User } from '../types';
import { ArrowRightIcon, UserIcon } from './icons';

interface LoginScreenProps {
  users: User[];
  onUserSelect: (user: User) => void;
  onUserCreate: (user: Omit<User, 'id'>) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ users, onUserSelect, onUserCreate }) => {
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [experience, setExperience] = useState('Principiante');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && surname) {
      onUserCreate({ name, surname, experience });
      setName('');
      setSurname('');
      setExperience('Principiante');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center animate-fade-in">
        <div className="w-full max-w-2xl bg-white p-8 rounded-xl shadow-lg border border-slate-200">
            <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">Bienvenido a CURSO VIRADS</h2>
            <p className="text-center text-slate-500 mb-8">Seleccione su perfil o registre uno nuevo para comenzar.</p>

            {users.length > 0 && (
                <div className="mb-8">
                    <h3 className="text-lg font-semibold text-slate-700 mb-4">Seleccionar Lector Existente</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {users.map((user) => (
                            <button
                                key={user.id}
                                onClick={() => onUserSelect(user)}
                                className="flex flex-col items-center p-4 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition text-center"
                            >
                                <UserIcon className="h-8 w-8 text-slate-500 mb-2" />
                                <span className="font-semibold text-slate-800">{user.name} {user.surname}</span>
                                <span className="text-xs text-slate-500">{user.experience}</span>
                            </button>
                        ))}
                    </div>
                     <hr className="my-8" />
                </div>
            )}
            
            <div>
                <h3 className="text-lg font-semibold text-slate-700 mb-4 text-center">Registrar Nuevo Lector</h3>
                <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                        <input
                            type="text"
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                            placeholder="Introduzca su nombre"
                        />
                    </div>
                    <div>
                        <label htmlFor="surname" className="block text-sm font-medium text-slate-700 mb-1">Apellidos</label>
                        <input
                            type="text"
                            id="surname"
                            value={surname}
                            onChange={(e) => setSurname(e.target.value)}
                            required
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                            placeholder="Introduzca sus apellidos"
                        />
                    </div>
                    <div>
                        <label htmlFor="experience" className="block text-sm font-medium text-slate-700 mb-1">Experiencia previa en VIRADS</label>
                        <select
                            id="experience"
                            value={experience}
                            onChange={(e) => setExperience(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white"
                        >
                            <option>Principiante</option>
                            <option>Intermedio</option>
                            <option>Experto</option>
                        </select>
                    </div>
                    <button
                        type="submit"
                        className="w-full flex items-center justify-center bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105"
                    >
                        Registrar y Continuar
                        <ArrowRightIcon className="h-5 w-5 ml-2" />
                    </button>
                </form>
            </div>
        </div>
    </div>
  );
};

export default LoginScreen;