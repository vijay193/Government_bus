import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
}

export const Input: React.FC<InputProps> = ({ label, id, className, ...props }) => {
  return (
    <div className="input-wrapper">
      <label htmlFor={id} className="input-label">
        {label}
      </label>
      <input
        id={id}
        className={`input-field ${className || ''}`}
        {...props}
      />
    </div>
  );
};