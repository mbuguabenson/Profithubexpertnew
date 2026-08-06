import React from 'react';
import PropTypes from 'prop-types';
import ErrorComponent from './index';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, info: null };
    }

    componentDidCatch = (error, info) => {
        console.error('[ErrorBoundary caught error]:', error, info);
        this.setState({
            hasError: true,
            error,
            info,
        });
    };

    handleResetError = () => {
        this.setState({ hasError: false, error: null, info: null });
    };

    render = () => {
        if (this.state.hasError) {
            return (
                <ErrorComponent
                    header='Application Error Encountered'
                    message={this.state.error?.message || 'A temporary UI render error occurred.'}
                    redirect_label='Try Recovering'
                    redirectOnClick={this.handleResetError}
                    should_show_refresh={true}
                    should_redirect={false}
                />
            );
        }
        return this.props.children;
    };
}

ErrorBoundary.propTypes = {
    root_store: PropTypes.object,
    children: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.node), PropTypes.node]),
};

export default ErrorBoundary;
