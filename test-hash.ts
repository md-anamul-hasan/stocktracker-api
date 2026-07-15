import { compare } from 'bcrypt-ts';

async function test() {
  const hash = '$2b$10$YcApAyqttPW9sNTR3mrmEuu6Xns72IBa47SWrLqZpDTvSD0HjTs6i';
  const match1 = await compare('admin123', hash);
  const match2 = await compare('password', hash);
  console.log('admin123:', match1);
  console.log('password:', match2);
}

test();
