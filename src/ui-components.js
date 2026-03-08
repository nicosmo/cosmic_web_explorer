/**
 * Cosmic Web Explorer
 * * A real-time cosmological visualization tool.
 * Copyright (c) 2026 Nico Schuster. Licensed under the GNU AGPLv3.
 * * ---
 * This tool is shared for educational and research purposes. It is provided
 * "as-is," without any warranty of any kind.
 * * For full license terms and citation instructions, please visit:
 * https://github.com/nicosmo/cosmic_web_explorer
 */


// ui-components.js — Small reusable React components (plain JS, no JSX)
// Loaded via <script src> before the main Babel-transpiled App.

/**
 * TooltipWrapper — portal-based tooltip that floats beside the trigger element.
 * Props: { text, children, className }
 */
const TooltipWrapper = (props) => {
    const { text, children, className } = props;
    const [show, setShow] = React.useState(false);
    const [pos, setPos] = React.useState({ top: 0, left: 0 });
    const triggerRef = React.useRef(null);

    const handleEnter = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPos({ top: rect.top + (rect.height / 2), left: rect.right + 10 });
            setShow(true);
        }
    };

    return React.createElement('div', {
        ref: triggerRef,
        className: className,
        onMouseEnter: handleEnter,
        onMouseLeave: () => setShow(false)
    },
        children,
        show && ReactDOM.createPortal(
            React.createElement('div', {
                className: 'portal-tooltip',
                style: { top: pos.top, left: pos.left, transform: 'translateY(-50%)' }
            },
                React.createElement('div', { className: 'portal-tooltip-arrow' }),
                text
            ),
            document.body
        )
    );
};
