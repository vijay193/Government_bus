import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

interface CaptchaProps {
  onVerify: (isVerified: boolean) => void;
}

export const Captcha: React.FC<CaptchaProps> = ({ onVerify }) => {
  const [captchaText, setCaptchaText] = useState('');
  const [userInput, setUserInput] = useState('');

  const generateCaptcha = () => {
    const randomString = Math.random().toString(36).substring(2, 8).toUpperCase();
    setCaptchaText(randomString);
  };

  useEffect(() => {
    generateCaptcha();
  }, []);

  useEffect(() => {
    onVerify(userInput === captchaText);
  }, [userInput, captchaText, onVerify]);

  return (
    <div className="captcha-container">
      <div className="captcha-image-wrapper">
        <div className="captcha-text">
          {captchaText}
        </div>
        <button onClick={generateCaptcha} type="button" className="captcha-refresh-btn">
          <RefreshCw size={20} />
        </button>
      </div>
      <input
        type="text"
        placeholder="Enter captcha"
        value={userInput}
        onChange={(e) => setUserInput(e.target.value.toUpperCase())}
        className="input-field"
      />
    </div>
  );
};