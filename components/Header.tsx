import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bus, User as UserIcon, UserCircle, LogOut, ShieldCheck, Ticket, ChevronDown } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from './common/Button';
import { UserRole } from '../types';

export const Header: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  const getRoleClass = () => {
    if (!user) return '';
    switch (user.role) {
      case UserRole.ADMIN:
        return 'role-admin';
      case UserRole.SUB_ADMIN:
        return 'role-sub-admin';
      case UserRole.USER:
        return 'role-user';
      default:
        return '';
    }
  };


  return (
    <header className="header">
      <div className="container">
        <div className="header__content">
          <Link to="/" className="header__logo">
            <Bus className="header__logo-icon" />
            <span className="header__logo-text">Govt <span className="header__logo-text-highlight">Bus</span></span>
          </Link>
          <nav className="header__nav">
            {(!isAuthenticated || user?.role === UserRole.USER) && (
              <>
                <Link to="/" className="header__nav-link">Schedules</Link>
                <Link to="/track" className="header__nav-link">Track Bus</Link>
              </>
            )}
            
            {isAuthenticated ? (
              <div className="header__user-menu" ref={dropdownRef}>
                <button className={`header__user-menu-trigger ${getRoleClass()}`} onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
                  <UserCircle className="icon" size={24} />
                  <span>{user?.fullName.split(' ')[0]}</span>
                  <ChevronDown size={16} className={`header__user-menu-chevron ${isDropdownOpen ? 'open' : ''}`} />
                </button>
                
                {isDropdownOpen && (
                  <div className="header__user-menu-dropdown">
                    {user?.role === UserRole.USER && (
                      <Link to="/dashboard" className="header__dropdown-item" onClick={() => setIsDropdownOpen(false)}>
                        <Ticket size={18} /> My Bookings
                      </Link>
                    )}

                    {(user?.role === UserRole.ADMIN || user?.role === UserRole.SUB_ADMIN) && (
                      <Link to="/admin" className="header__dropdown-item" onClick={() => setIsDropdownOpen(false)}>
                        <ShieldCheck size={18} /> {user.role === UserRole.ADMIN ? 'Admin Panel' : 'Management'}
                      </Link>
                    )}

                    <Link to="/profile" className="header__dropdown-item" onClick={() => setIsDropdownOpen(false)}>
                      <UserIcon size={18} /> Profile
                    </Link>

                    <div className="header__dropdown-separator" />
                    
                    <button onClick={handleLogout} className="header__dropdown-item header__dropdown-item--logout">
                      <LogOut size={18} /> Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/login">
                <Button variant="primary">Login</Button>
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
};