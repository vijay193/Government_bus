import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bus, User as UserIcon, UserCircle, LogOut, ShieldCheck, Ticket } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from './common/Button';
import { UserRole } from '../types';

export const Header: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="header">
      <div className="container">
        <div className="header__content">
          <Link to="/" className="header__logo">
            <Bus className="header__logo-icon" />
            <span className="header__logo-text">Government <span className="header__logo-text-highlight">Bus</span></span>
          </Link>
          <nav className="header__nav">
            {(!isAuthenticated || user?.role === UserRole.USER) && (
              <>
                <Link to="/" className="header__nav-link">Schedules</Link>
                <Link to="/track" className="header__nav-link">Track Bus</Link>
              </>
            )}
            
            {isAuthenticated ? (
              <div className="header__user-actions">
                {user?.role === UserRole.USER && (
                  <>
                    <Link to="/dashboard" className="header__nav-link">
                      <Ticket size={18} />
                      <span className="header__nav-link-text">My Bookings</span>
                    </Link>
                    <Link to="/profile" className="header__nav-link">
                        <UserIcon size={18} />
                        <span className="header__nav-link-text">Profile</span>
                    </Link>
                  </>
                )}

                {(user?.role === UserRole.ADMIN || user?.role === UserRole.SUB_ADMIN) && (
                  <>
                    <Link to="/admin" className="header__nav-link">
                      <ShieldCheck size={18} />
                      <span className="header__nav-link-text">{user.role === UserRole.ADMIN ? 'Admin' : 'Management'}</span>
                    </Link>
                    <Link to="/profile" className="header__nav-link">
                        <UserIcon size={18} />
                        <span className="header__nav-link-text">Profile</span>
                    </Link>
                  </>
                )}
                
                <div className="header__nav-separator" />

                <div className="header__user-info">
                    <span className="header__user-name">
                      <UserCircle className="icon" />
                      {user?.fullName.split(' ')[0]}
                    </span>
                    <Button onClick={handleLogout} variant="danger" className="header__logout-btn">
                      <div className="btn__loader">
                        <LogOut size={18} />
                        <span className='header__logout-btn-text'>Logout</span>
                      </div>
                    </Button>
                </div>
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