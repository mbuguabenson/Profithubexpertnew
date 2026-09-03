import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Trade from 'Modules/Trading';
import { TBinaryRoutesProps } from 'Types';

const ContractDetails = React.lazy(() => import('Modules/Contract'));

const BinaryRoutes = (props: TBinaryRoutesProps) => (
    <React.Suspense fallback={<div />}>
        <Routes>
            <Route path='/contract/:contract_id' element={<ContractDetails {...(props as any)} />} />
            <Route path='*' element={<Trade {...(props as any)} />} />
        </Routes>
    </React.Suspense>
);

export default BinaryRoutes;
