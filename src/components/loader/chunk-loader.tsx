import './chunk-loader.scss';

export default function ChunkLoader({ message }: { message?: string; isWelcome?: boolean }) {
    return (
        <div className='chunk-loader-overlay clean'>
            <div className='bouncing-loader-wrapper'>
                {/* Concentric Spinner Loader - No Card */}
                <div className='spinner' />
                {message && <span className='bouncing-loader-msg'>{message}</span>}
            </div>
        </div>
    );
}
