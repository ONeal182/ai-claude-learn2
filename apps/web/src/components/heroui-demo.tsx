'use client';

import { Button } from '@heroui/react';

export function HeroUIDemo() {
  return (
    <Button variant="primary" onPress={() => alert('HeroUI работает')}>
      HeroUI Button
    </Button>
  );
}
