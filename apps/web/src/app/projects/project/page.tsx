'use client';

import { retrieveProject } from '@/app/actions';
import type { ProjectDTO } from '@repo/ts/utils/types';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';

const ProjectPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectName = useMemo(() => searchParams.get('projectName'), [searchParams]);
  const [project, setProject] = useState<ProjectDTO>();

  useEffect(() => {
    if (!projectName) {
      console.error('No project name provided in search params.');
      router.push("/projects");
      return;
    }

    retrieveProject(projectName).then((data: ProjectDTO | null) => {
      if (!data) {
        console.error('Project not found:', projectName);
        router.push("/projects");
        return;
      }
      setProject(data);
    });
  }, [projectName, router]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg">Loading project...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {JSON.stringify(project, null, 2)}
    </div>
  );
};

export default ProjectPage;

