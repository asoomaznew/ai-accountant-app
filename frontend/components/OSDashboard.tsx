import React from 'react';
import { motion } from 'framer-motion';
import { 
    FileText, ScanLine, FileSearch, 
    BrainCircuit, FileSpreadsheet, Download, ArrowDown
} from 'lucide-react';
import { cn } from '../lib/utils';

interface PipelineStep {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    color: string;
}

const V4_PIPELINE: PipelineStep[] = [
    { 
        id: "document", 
        name: "Document", 
        description: "PDF / Image / CSV Input", 
        icon: <FileText size={28} />, 
        color: "from-blue-500 to-indigo-500" 
    },
    { 
        id: "ocr", 
        name: "OCR", 
        description: "Optical Character Recognition", 
        icon: <ScanLine size={28} />, 
        color: "from-indigo-500 to-violet-500" 
    },
    { 
        id: "extract", 
        name: "Extract Data", 
        description: "Basic Data Parsing", 
        icon: <FileSearch size={28} />, 
        color: "from-violet-500 to-purple-500" 
    },
    { 
        id: "ai_model", 
        name: "AI Model", 
        description: "Enrichment & Accounting Logic", 
        icon: <BrainCircuit size={28} />, 
        color: "from-purple-500 to-fuchsia-500" 
    },
    { 
        id: "journal", 
        name: "Journal", 
        description: "Single Journal Entry Generation", 
        icon: <FileSpreadsheet size={28} />, 
        color: "from-fuchsia-500 to-pink-500" 
    },
    { 
        id: "excel", 
        name: "Excel", 
        description: "D365 Ready Export", 
        icon: <Download size={28} />, 
        color: "from-pink-500 to-rose-500" 
    }
];

const OSDashboard: React.FC = () => {
    return (
        <div className="w-full max-w-4xl mx-auto py-12 px-4 flex flex-col items-center">
            <div className="mb-16 text-center">
                <h1 className="text-3xl font-bold text-slate-100 mb-3">AI Accountant V4</h1>
                <p className="text-slate-400 max-w-lg mx-auto">
                    The latest, lightest, and fastest architecture pipeline. A straightforward linear flow designed for maximum performance and minimal complexity.
                </p>
            </div>

            <div className="relative w-full flex flex-col items-center">
                {V4_PIPELINE.map((step, index) => {
                    const isLast = index === V4_PIPELINE.length - 1;
                    return (
                        <React.Fragment key={step.id}>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.15, duration: 0.5 }}
                                className="w-full sm:w-2/3 md:w-1/2 flex items-center justify-center relative group"
                            >
                                <div className="w-full bg-dark-200/60 backdrop-blur-sm border border-slate-700/50 p-5 rounded-3xl shadow-xl hover:border-slate-500/50 transition-all hover:-translate-y-1 hover:shadow-2xl">
                                    <div className="flex items-center gap-5">
                                        <div className={cn(
                                            "flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg",
                                            "bg-gradient-to-br group-hover:scale-110 transition-transform duration-300",
                                            step.color
                                        )}>
                                            {step.icon}
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-200 tracking-wide">{step.name}</h3>
                                            <p className="text-sm text-slate-400 mt-1 font-medium">{step.description}</p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                            
                            {!isLast && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    transition={{ delay: (index * 0.15) + 0.1, duration: 0.3 }}
                                    className="py-4 text-slate-600 flex flex-col items-center"
                                >
                                    <div className="w-0.5 h-6 bg-slate-700/50 mb-1 rounded-full" />
                                    <ArrowDown size={20} className="text-slate-600 animate-pulse" />
                                </motion.div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

export default OSDashboard;
