import React from 'react';
import { useNavigate, useLocation, useParams, Navigate } from 'react-router-dom';

export function withRouter<T>(Component: React.ComponentType<any>) {
    return function ComponentWithRouterProp(props: T) {
        const location = useLocation();
        const navigate = useNavigate();
        const params = useParams();
        return (
            <Component
                {...props}
                location={location}
                match={{ params, isExact: true, path: location.pathname, url: location.pathname }}
                history={{
                    location,
                    push: (path: string) => navigate(path),
                    replace: (path: string) => navigate(path, { replace: true }),
                    goBack: () => navigate(-1),
                }}
            />
        );
    };
}

export const Redirect = ({ to }: { to: string }) => <Navigate to={to} replace />;

export function useHistory() {
    const navigate = useNavigate();
    const location = useLocation();
    return {
        location,
        push: (path: string) => navigate(path),
        replace: (path: string) => navigate(path, { replace: true }),
        goBack: () => navigate(-1),
    };
}

export default withRouter;
