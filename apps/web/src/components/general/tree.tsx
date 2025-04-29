import { useCallback } from "react";
import { Tree as ArbTree, NodeApi } from "react-arborist";

export interface TreeProps<T> {
  data: T[];
  renderLabel?: (
    node: T,
    isSelected: boolean,
    toggle: () => void,
    isOpen: boolean,
    hasChildren: boolean,
    style: React.CSSProperties,
    onClick: () => void,
  ) => React.ReactNode;
  onSelect?: (node: T) => void;
  rowHeight?: number;
  openByDefault?: boolean;
  width?: string | number;
  selectedId?: string;
}

export function Tree<T extends { id: string; children?: T[] }>({
  data,
  renderLabel,
  onSelect,
  rowHeight = 40,
  openByDefault = false,
  width = "100%",
  selectedId,
}: TreeProps<T>) {
  const handleSelect = useCallback(
    (node: NodeApi<T>) => {
      if (onSelect) {
        onSelect(node.data);
      }
      if (node.isClosed) {
        node.toggle();
      }
    },
    [onSelect],
  );

  return (
    <ArbTree<T>
      openByDefault={openByDefault}
      data={data}
      rowHeight={rowHeight}
      width={width}
    >
      {(props) => {
        const { node } = props;
        const hasChildren = node.children && node.children.length > 0;
        const isSelected = selectedId === node.data.id;
        const onClick = () => handleSelect(node);
        const defaultLabel = (
          <div
            style={props.style}
            className={`flex items-center p-2 cursor-pointer hover:bg-blue-100 select-none ${isSelected ? "bg-blue-200" : ""
              } break-words`}
            onClick={onClick}
          >
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  node.toggle();
                }}
                className="mr-2 focus:outline-none"
              >
                {node.isOpen ? "▼" : "▶"}
              </button>
            )}
            <span className="flex-1">
              {"name" in node.data ? (node.data.name as string) : "Unnamed"}
            </span>
          </div>
        );

        return renderLabel
          ? renderLabel(
            node.data,
            isSelected,
            () => node.toggle(),
            node.isOpen,
            !!hasChildren,
            props.style,
            onClick,
          )
          : defaultLabel;
      }}
    </ArbTree>
  );
}
