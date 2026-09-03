import { Zap } from 'lucide-react';
import './chunk-loader.scss';

interface ChunkLoaderProps {
    message?: string;
}

export default function ChunkLoader({ message = 'Loading workspace...' }: ChunkLoaderProps) {
    return (
        <div className='lth-compact-loader' role='status' aria-live='polite'>
            <div className='lth-gyro-wrapper'>
                {/* Outer Orbit Ring */}
                <div className='lth-orbit lth-orbit-outer'>
                    <div className='lth-orbit-dot' />
                </div>
                {/* Mid Gyro Ring */}
                <div className='lth-orbit lth-orbit-mid'>
                    <div className='lth-orbit-dot' />
                </div>
                {/* Inner Rapid Ring */}
                <div className='lth-orbit lth-orbit-inner' />
                {/* Quantum Core */}
                <div className='lth-core-orb'>
                    <Zap size={14} className='lth-core-icon' />
                </div>
            </div>
            {message && (
                <div className='lth-loader-telemetry'>
                    <span className='lth-loader-label'>{message}</span>
                    <div className='lth-loader-pulses'>
                        <span className='p-dot' />
                        <span className='p-dot' />
                        <span className='p-dot' />
                    </div>
                </div>
            )}
        </div>
    );
}
