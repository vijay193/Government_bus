import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/common/Button';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="not-found-page">
      <h1 className="not-found-page__title">404</h1>
      <p className="not-found-page__subtitle">Page Not Found</p>
      <p className="not-found-page__text">
        Sorry, the page you are looking for does not exist or has been moved.
      </p>
      <Link to="/">
        <Button variant="primary">Go Back Home</Button>
      </Link>
    </div>
  );
};