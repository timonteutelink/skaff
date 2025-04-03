'use client';
import { TemplateDTO } from '@repo/ts/utils/types';
import React, { useEffect, useMemo, useState } from 'react';
import { Tree } from 'react-arborist';
import { retrieveTemplates } from '../actions';

// fix all paths to be relative including the root template path so rust/...
interface ArboristNode {
  id: string;
  data: TemplateDTO;
  children?: ArboristNode[];
}

function mapTemplateToArboristNode(template: TemplateDTO): ArboristNode[] {
  return [{
    id: template.dir,
    data: template,
    children: template.subTemplates.map(mapTemplateToArboristNode).flat(),
  }];
}

export default function TemplateArboristTreePage() {
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);

  useEffect(() => {
    retrieveTemplates().then((templates) => {
      setTemplates(templates);
      console.log(templates);
    });
  }, []);

  const nodes: ArboristNode[] = useMemo(() => {
    const template = templates[0];
    if (!template) return [];
    return mapTemplateToArboristNode(template)
  }, [templates]);

  return (
    <div className="p-4">
      <Tree
        data={nodes}
        rowHeight={30}
      />
    </div>
  );
};

