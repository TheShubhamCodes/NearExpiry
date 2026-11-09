import React from 'react';
import Register from './Register';

/**
 * InitialSetup re-uses the unified Register component
 * to preserve backward compatibility for the /setup route.
 */
export default function InitialSetup() {
  return <Register />;
}
