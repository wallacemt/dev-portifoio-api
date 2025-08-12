import { ZodError } from 'zod';
import { SkillRepository } from '../repository/skillRepository';
import {
  type Skill,
  type SkillAddRequest,
  SkillType,
  type SkillUpdateRequest,
  StackType,
} from '../types/skills';
import { Exception } from '../utils/exception';
import {
  skillSchema,
  skillSchemaOptional,
} from '../validations/skillValidation';

export class SkillService {
  private skillRepository = new SkillRepository();

  public async findAllSkill(
    ownerId: string
  ): Promise<{
    skills: Skill[];
    texts: { chooseText: string; title: string; description: string };
  }> {
    if (!ownerId || ownerId === ':ownerId')
      throw new Exception('ID de owner invalido', 400);
    const res = await this.skillRepository.findAllSkills(ownerId);
    const texts = {
      chooseText: 'Escolha uma habilidade',
      title: 'Minhas Habilidades',
      description:
        ' Habilidades que domino e utilizo em meus projetos, que desenvolvi ao mediante a cursos e projetos pessoais.',
    };
    return { skills: res, texts };
  }

  public async getAllTypes() {
    const skillTypes = Object.values(SkillType) as string[];
    const stackTypes = Object.values(StackType) as string[];
    const types = { skillTypes, stackTypes };
    return types;
  }

  public async addSkill(skill: SkillAddRequest) {
    try {
      skillSchema.parse(skill);
      return await this.skillRepository.addSkill(skill);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues[0].message, 400);
      }
      throw new Exception('Informe os dados corretamente', 400);
    }
  }

  public async updateSkill(skill: SkillUpdateRequest, skillId: string) {
    if (!skillId || skillId === ':id')
      throw new Exception('ID do projeto invalido', 400);
    if (!(await this.skillRepository.findById(skillId)))
      throw new Exception('Projeto não encontrado', 404);
    try {
      skillSchemaOptional.parse(skill);
      return await this.skillRepository.updateSkill(skill, skillId);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues[0].message, 400);
      }
      throw new Exception('Informe os dados corretamente', 400);
    }
  }

  public async deleteSkill(skillId: string) {
    if (!skillId || skillId === ':id')
      throw new Exception('ID do projeto invalido', 400);
    if (!(await this.skillRepository.findById(skillId)))
      throw new Exception('Projeto não encontrado', 404);

    return await this.skillRepository.deleteSkill(skillId);
  }
}
